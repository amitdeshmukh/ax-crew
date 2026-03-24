import type { AxFunction, AxStepHooks } from '@ax-llm/ax';

export interface DeferredToolsConfig {
  /** Enable deferred tool loading. Default: auto (true when tool count > threshold) */
  enabled?: boolean;
  /** Tool count threshold to activate deferred mode. Default: 20 */
  threshold?: number;
  /** Max tools returned per search. Default: 10 */
  maxSearchResults?: number;
  /** Tool names to always keep active (bypasses deferral) */
  coreTools?: string[];
}

const DEFAULT_THRESHOLD = 20;
const DEFAULT_MAX_RESULTS = 10;

/**
 * Manages deferred tool loading for agents with many tools.
 *
 * When tool count exceeds a threshold, only core tools + a `search_tools`
 * meta-function are visible to the LLM. The LLM calls `search_tools` to
 * discover and activate deferred tools, which are injected via ax-llm
 * step hooks for subsequent turns.
 *
 * Search is fully local — no API calls or embeddings needed. Uses multi-signal
 * scoring: exact/partial name match, description terms, parameter names,
 * bigram overlap, and a built-in synonym map for common intent→tool mappings.
 */
export class DeferredToolManager {
  private registry: Map<string, AxFunction>;
  private deferredNames: Set<string>;
  private activatedNames: Set<string>;
  private coreNames: Set<string>;
  private readonly maxSearchResults: number;
  private readonly _isActive: boolean;
  private resourceCache: Map<string, unknown>;

  // Pre-computed search index (built once at construction)
  private searchIndex: Map<string, {
    nameTokens: string[];
    descTokens: string[];
    paramTokens: string[];
    bigrams: Set<string>;
    fullText: string;
  }>;

  // Common synonyms: intent words → tool-relevant terms
  private static readonly SYNONYMS: Record<string, string[]> = {
    'query': ['execute', 'graphql', 'sql', 'select', 'find', 'search', 'get', 'read', 'fetch'],
    'database': ['table', 'schema', 'column', 'db', 'sql', 'graphql', 'describe'],
    'list': ['get', 'show', 'display', 'enumerate', 'all'],
    'create': ['insert', 'add', 'new', 'write', 'mutation', 'save'],
    'update': ['modify', 'change', 'edit', 'patch', 'mutation', 'upsert'],
    'delete': ['remove', 'drop', 'destroy', 'mutation'],
    'schema': ['table', 'column', 'type', 'describe', 'structure', 'definition'],
    'run': ['execute', 'invoke', 'call', 'workflow'],
    'save': ['store', 'persist', 'write'],
    'config': ['configuration', 'setting', 'option', 'setup'],
    'fix': ['repair', 'debug', 'error', 'resolve', 'troubleshoot'],
    'test': ['check', 'verify', 'validate', 'health', 'connection'],
    'explore': ['discover', 'browse', 'inspect', 'navigate', 'relationship'],
  };

  constructor(
    allFunctions: readonly AxFunction[],
    mcpFunctionNames: ReadonlySet<string>,
    config?: DeferredToolsConfig
  ) {
    const threshold = config?.threshold ?? DEFAULT_THRESHOLD;
    this.maxSearchResults = config?.maxSearchResults ?? DEFAULT_MAX_RESULTS;
    this.activatedNames = new Set();
    this.searchIndex = new Map();
    this.resourceCache = new Map();

    // Build full registry
    this.registry = new Map();
    for (const fn of allFunctions) {
      this.registry.set(fn.name, fn);
    }

    // Determine if we should activate deferred mode
    const explicitEnabled = config?.enabled;
    this._isActive = explicitEnabled !== undefined
      ? explicitEnabled
      : allFunctions.length > threshold;

    // Classify core vs deferred
    const explicitCore = new Set(config?.coreTools ?? []);
    this.coreNames = new Set<string>();
    this.deferredNames = new Set<string>();

    if (this._isActive) {
      for (const fn of allFunctions) {
        const isMcp = mcpFunctionNames.has(fn.name);
        const isResource = fn.name.startsWith('resource_');
        const isExplicitCore = explicitCore.has(fn.name);

        if (isExplicitCore || isResource || !isMcp) {
          this.coreNames.add(fn.name);
        } else {
          this.deferredNames.add(fn.name);
        }
      }

      // Build search index for deferred tools
      this.buildSearchIndex();
    } else {
      for (const fn of allFunctions) {
        this.coreNames.add(fn.name);
      }
    }
  }

  /** Whether deferred mode is active */
  get isActive(): boolean {
    return this._isActive;
  }

  /** Build the local search index — called once at construction */
  private buildSearchIndex(): void {
    for (const name of this.deferredNames) {
      const fn = this.registry.get(name);
      if (!fn) continue;

      const nameTokens = this.tokenize(fn.name);
      const descTokens = this.tokenize(fn.description ?? '');
      const paramTokens = fn.parameters?.properties
        ? Object.keys(fn.parameters.properties).flatMap(p => this.tokenize(p))
        : [];

      const fullText = `${fn.name} ${fn.description ?? ''} ${paramTokens.join(' ')}`.toLowerCase();
      const allTokens = [...nameTokens, ...descTokens, ...paramTokens];
      const bigrams = this.buildBigrams(allTokens);

      this.searchIndex.set(name, { nameTokens, descTokens, paramTokens, bigrams, fullText });
    }
  }

  /** Tokenize a string into lowercase words, splitting on underscores and camelCase */
  private tokenize(text: string): string[] {
    return text
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase split
      .replace(/[_\-./]/g, ' ')                // split on separators
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 1);              // drop single chars
  }

  /** Build character bigrams from tokens for fuzzy matching */
  private buildBigrams(tokens: string[]): Set<string> {
    const bigrams = new Set<string>();
    for (const token of tokens) {
      for (let i = 0; i < token.length - 1; i++) {
        bigrams.add(token.slice(i, i + 2));
      }
    }
    return bigrams;
  }

  /** Expand query terms with synonyms */
  private expandWithSynonyms(terms: string[]): string[] {
    const expanded = new Set(terms);
    for (const term of terms) {
      const synonyms = DeferredToolManager.SYNONYMS[term];
      if (synonyms) {
        for (const syn of synonyms) expanded.add(syn);
      }
      // Reverse lookup: if the term appears as a synonym value, add the key
      for (const [key, values] of Object.entries(DeferredToolManager.SYNONYMS)) {
        if (values.includes(term)) expanded.add(key);
      }
    }
    return Array.from(expanded);
  }

  /** Get the initial function set (core tools + search_tools) */
  getInitialFunctions(): AxFunction[] {
    const initial: AxFunction[] = [];
    for (const name of this.coreNames) {
      const fn = this.registry.get(name);
      if (fn) initial.push(fn.name.startsWith('resource_') ? this.wrapWithCache(fn) : fn);
    }
    if (this._isActive) {
      initial.push(this.createSearchToolFunction());
    }
    return initial;
  }

  /** Wrap a resource function so repeated calls return cached results */
  private wrapWithCache(fn: AxFunction): AxFunction {
    const cache = this.resourceCache;
    const originalFunc = fn.func;
    if (!originalFunc) return fn;

    return {
      ...fn,
      func: async (args: Record<string, unknown>) => {
        const cached = cache.get(fn.name);
        if (cached !== undefined) return cached;
        const result = await originalFunc(args);
        cache.set(fn.name, result);
        return result;
      },
    };
  }

  /** Get step hooks for dynamic tool activation.
   *  - beforeStep: injects previously activated tools at the start of each
   *    forward() call so tools discovered in earlier calls persist.
   *  - afterFunctionExecution: injects newly discovered tools after search_tools runs.
   */
  getStepHooks(): AxStepHooks {
    const injectedNames = new Set<string>();

    const injectActivated = (ctx: { addFunctions: (fns: AxFunction[]) => void }) => {
      const toInject: AxFunction[] = [];
      for (const name of this.activatedNames) {
        if (!this.coreNames.has(name) && !injectedNames.has(name)) {
          const fn = this.registry.get(name);
          if (fn) {
            toInject.push(fn);
            injectedNames.add(name);
          }
        }
      }
      if (toInject.length > 0) {
        ctx.addFunctions(toInject);
      }
    };

    return {
      beforeStep: async (ctx) => {
        // On the first step of a new forward() call, re-inject any tools
        // that were activated in previous forward() calls.
        if (this.activatedNames.size > 0) {
          injectActivated(ctx as any);
        }
      },
      afterFunctionExecution: async (ctx) => {
        // After search_tools: inject discovered tools
        if (ctx.functionsExecuted.has('search_tools')) {
          injectActivated(ctx);
        }

        // Auto-activate deferred tools mentioned in function results.
        // This handles cases where a tool error suggests using another tool
        // (e.g., GraphJin's "recommended_tool": "fix_query_error").
        this.autoActivateFromResults(ctx.lastFunctionCalls);
        injectActivated(ctx);
      },
    };
  }

  /**
   * Scan function results for mentions of deferred tool names and auto-activate them.
   * This ensures that when an MCP server suggests using another tool (e.g., via
   * "recommended_tool" in error responses), that tool becomes available without
   * requiring the LLM to call search_tools first.
   */
  private autoActivateFromResults(
    functionCalls: readonly { readonly name: string; readonly result: unknown }[] | undefined
  ): void {
    if (!functionCalls || functionCalls.length === 0 || this.deferredNames.size === 0) return;

    for (const call of functionCalls) {
      // Stringify the result to scan for tool name mentions.
      // For MCP tools, the result is often { content: [{ text: "..." }] } —
      // JSON.stringify captures the nested text which may reference other tools.
      const resultText = typeof call.result === 'string'
        ? call.result
        : JSON.stringify(call.result ?? '');
      if (!resultText) continue;

      for (const name of this.deferredNames) {
        if (!this.activatedNames.has(name) && resultText.includes(name)) {
          this.activatedNames.add(name);
        }
      }
    }
  }

  /**
   * When primary tools are activated, also activate related tools that share
   * significant name tokens. E.g., activating "execute_graphql" also activates
   * "fix_query_error", "explain_query", "get_query_syntax" since they share
   * the "query"/"graphql" domain.
   */
  /**
   * When primary tools are activated, also activate related tools that share
   * significant tokens (from name, description, or params). E.g., activating
   * "execute_graphql" also activates "fix_query_error", "explain_query",
   * "get_query_syntax" since they share domain tokens like "query", "graphql".
   */
  private activateRelatedTools(primaryNames: string[]): void {
    if (primaryNames.length === 0) return;

    // Collect significant tokens from primary tools (name + desc + params)
    const primaryTokens = new Set<string>();
    for (const name of primaryNames) {
      const index = this.searchIndex.get(name);
      if (index) {
        for (const t of [...index.nameTokens, ...index.descTokens, ...index.paramTokens]) {
          if (t.length > 3) primaryTokens.add(t); // length > 3 to skip noise like "get", "set"
        }
      }
    }

    // Find deferred tools that share at least 2 significant tokens
    for (const [name, index] of this.searchIndex) {
      if (this.activatedNames.has(name)) continue;

      const allTokens = [...index.nameTokens, ...index.descTokens];
      const shared = allTokens.filter(t => t.length > 3 && primaryTokens.has(t));
      // Activate if tool shares at least 2 significant tokens with primary set
      if (shared.length >= 2) {
        this.activatedNames.add(name);
      }
    }
  }

  /** Search deferred tools using multi-signal local scoring */
  private search(query: string): string {
    const matchedNames = this.localSearch(query);

    if (matchedNames.length === 0) {
      return `No tools found matching "${query}". Available tool categories: ${this.getSummary()}`;
    }

    // Separate newly activated from already-active
    const newlyActivated: AxFunction[] = [];
    const alreadyActive: string[] = [];
    for (const name of matchedNames) {
      if (this.activatedNames.has(name)) {
        alreadyActive.push(name);
      } else {
        this.activatedNames.add(name);
        const fn = this.registry.get(name);
        if (fn) newlyActivated.push(fn);
      }
    }

    // Also activate tools related to the newly found ones
    this.activateRelatedTools(matchedNames);

    if (newlyActivated.length === 0) {
      return `All ${alreadyActive.length} matching tools are already active: ${alreadyActive.join(', ')}. Call them directly without searching again.`;
    }

    const lines = newlyActivated.map((fn) => {
      const params = fn.parameters?.properties
        ? Object.keys(fn.parameters.properties).join(', ')
        : 'none';
      return `- **${fn.name}**: ${fn.description ?? 'No description'} (params: ${params})`;
    });

    const parts = [
      `Found ${newlyActivated.length} new tool(s) matching "${query}":`,
      '',
      ...lines,
      '',
      'These tools are now available. Call them directly.',
    ];

    if (alreadyActive.length > 0) {
      parts.push(`Also already active: ${alreadyActive.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Multi-signal local search — no API calls, no embeddings.
   *
   * Scoring signals (all additive):
   * 1. Exact name match (highest weight)
   * 2. Query term appears in tool name tokens
   * 3. Query term appears in tool description tokens
   * 4. Query term appears in parameter names
   * 5. Synonym-expanded terms match any of the above
   * 6. Bigram overlap for fuzzy matching (handles typos, partial words)
   * 7. Full phrase substring match
   */
  private localSearch(query: string): string[] {
    const queryTerms = this.tokenize(query);
    const expandedTerms = this.expandWithSynonyms(queryTerms);
    const queryBigrams = this.buildBigrams(queryTerms);
    const queryLower = query.toLowerCase();

    const scored: Array<{ name: string; score: number }> = [];

    for (const [name, index] of this.searchIndex) {
      let score = 0;

      // Signal 1: Exact name match
      if (name.toLowerCase() === queryLower.replace(/\s+/g, '_')) {
        score += 20;
      }

      // Signal 2: Query terms in tool name (high weight — name is most specific)
      for (const term of queryTerms) {
        if (index.nameTokens.some(t => t === term)) score += 5;
        else if (index.nameTokens.some(t => t.includes(term) || term.includes(t))) score += 3;
      }

      // Signal 3: Query terms in description
      for (const term of queryTerms) {
        if (index.descTokens.some(t => t === term)) score += 2;
        else if (index.descTokens.some(t => t.includes(term) || term.includes(t))) score += 1;
      }

      // Signal 4: Query terms in parameter names
      for (const term of queryTerms) {
        if (index.paramTokens.some(t => t === term)) score += 2;
        else if (index.paramTokens.some(t => t.includes(term) || term.includes(t))) score += 1;
      }

      // Signal 5: Synonym-expanded terms (lower weight to avoid noise)
      const synonymOnly = expandedTerms.filter(t => !queryTerms.includes(t));
      for (const term of synonymOnly) {
        if (index.nameTokens.some(t => t === term)) score += 3;
        else if (index.descTokens.some(t => t === term)) score += 1;
        else if (index.paramTokens.some(t => t === term)) score += 1;
      }

      // Signal 6: Bigram overlap (fuzzy matching)
      if (queryBigrams.size > 0 && index.bigrams.size > 0) {
        let overlap = 0;
        for (const bg of queryBigrams) {
          if (index.bigrams.has(bg)) overlap++;
        }
        const similarity = overlap / Math.max(queryBigrams.size, 1);
        if (similarity > 0.3) score += Math.round(similarity * 4);
      }

      // Signal 7: Full phrase substring in full text
      if (index.fullText.includes(queryLower)) {
        score += 3;
      }

      if (score > 0) {
        scored.push({ name, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, this.maxSearchResults).map((s) => s.name);
  }

  /** Get a brief summary of deferred tool categories */
  private getSummary(): string {
    const names = Array.from(this.deferredNames).slice(0, 30);
    return names.join(', ') + (this.deferredNames.size > 30 ? '...' : '');
  }

  /** Create the search_tools meta-function */
  private createSearchToolFunction(): AxFunction {
    return {
      name: 'search_tools',
      description:
        'Search for available tools by describing what you need. This agent has additional specialized tools not shown by default. ' +
        'Describe the task (e.g., "query database tables" or "list available schemas") and matching tools will be activated. ' +
        'Call this ONCE to discover tools, then use them directly. Do NOT call search_tools again for already discovered tools.',
      parameters: {
        type: 'object' as const,
        properties: {
          query: {
            type: 'string',
            description: 'Describe what you need to do (e.g., "query database", "list tables", "execute graphql")',
          },
        },
        required: ['query'],
      },
      func: async (args: { query: string }) => {
        return this.search(args.query);
      },
    };
  }
}
