import { AxDBMemory } from '@ax-llm/ax';
import type { AxAIService, AxFunction, AxStepHooks } from '@ax-llm/ax';

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
 * Uses AxDBMemory + embeddings for semantic search — "query database tables"
 * correctly matches `list_tables`, `execute_graphql`, `describe_table` even
 * though they don't contain the word "database".
 */
export class DeferredToolManager {
  private registry: Map<string, AxFunction>;
  private deferredNames: Set<string>;
  private activatedNames: Set<string>;
  private coreNames: Set<string>;
  private readonly maxSearchResults: number;
  private readonly _isActive: boolean;

  // Semantic search state
  private ai: AxAIService | null = null;
  private vectorDb: AxDBMemory | null = null;
  private semanticReady = false;

  constructor(
    allFunctions: readonly AxFunction[],
    mcpFunctionNames: ReadonlySet<string>,
    config?: DeferredToolsConfig
  ) {
    const threshold = config?.threshold ?? DEFAULT_THRESHOLD;
    this.maxSearchResults = config?.maxSearchResults ?? DEFAULT_MAX_RESULTS;
    this.activatedNames = new Set();

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
          // Core: custom functions, sub-agent functions, resource_*, explicitly listed
          this.coreNames.add(fn.name);
        } else {
          // Deferred: MCP tool functions (non-resource)
          this.deferredNames.add(fn.name);
        }
      }
    } else {
      // Not active — everything is core
      for (const fn of allFunctions) {
        this.coreNames.add(fn.name);
      }
    }
  }

  /** Whether deferred mode is active */
  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Initialize semantic search by embedding all deferred tool descriptions.
   * Must be called after construction with an AI service that supports embeddings.
   * Falls back to keyword search if this is not called or if embedding fails.
   */
  async initSemanticSearch(ai: AxAIService): Promise<void> {
    if (!this._isActive || this.deferredNames.size === 0) return;

    this.ai = ai;
    this.vectorDb = new AxDBMemory();

    try {
      // Build rich descriptions for each deferred tool
      const toolEntries: Array<{ name: string; text: string }> = [];
      for (const name of this.deferredNames) {
        const fn = this.registry.get(name);
        if (!fn) continue;
        // Combine name + description + parameter names for richer semantic context
        const paramNames = fn.parameters?.properties
          ? Object.keys(fn.parameters.properties).join(', ')
          : '';
        const text = `${fn.name}: ${fn.description ?? ''}${paramNames ? `. Parameters: ${paramNames}` : ''}`;
        toolEntries.push({ name, text });
      }

      // Batch embed all tool descriptions
      const texts = toolEntries.map((e) => e.text);
      const { embeddings } = await ai.embed({ texts });

      // Store in vector DB
      for (let i = 0; i < toolEntries.length; i++) {
        const entry = toolEntries[i];
        const embedding = embeddings[i];
        if (entry && embedding) {
          await this.vectorDb.upsert({
            id: entry.name,
            table: 'tools',
            values: embedding,
            metadata: { text: entry.text },
          });
        }
      }

      this.semanticReady = true;
    } catch (err) {
      // Embedding not supported or failed — fall back to keyword search
      console.warn(
        `[ax-crew] Semantic search init failed, falling back to keyword search: ${err instanceof Error ? err.message : String(err)}`
      );
      this.ai = null;
      this.vectorDb = null;
    }
  }

  /** Get the initial function set (core tools + search_tools) */
  getInitialFunctions(): AxFunction[] {
    const initial: AxFunction[] = [];
    for (const name of this.coreNames) {
      const fn = this.registry.get(name);
      if (fn) initial.push(fn);
    }
    if (this._isActive) {
      initial.push(this.createSearchToolFunction());
    }
    return initial;
  }

  /** Get step hooks for dynamic tool activation */
  getStepHooks(): AxStepHooks {
    // Track which tools have already been injected via ctx.addFunctions
    const injectedNames = new Set<string>();

    return {
      afterFunctionExecution: async (ctx) => {
        if (!ctx.functionsExecuted.has('search_tools')) return;

        // Only inject tools that haven't been injected before
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
      },
    };
  }

  /** Search deferred tools — uses semantic search if available, falls back to keyword */
  private async search(query: string): Promise<string> {
    const matchedNames = this.semanticReady
      ? await this.semanticSearch(query)
      : this.keywordSearch(query);

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

    // If all matches were already activated, return a short message
    if (newlyActivated.length === 0) {
      return `All ${alreadyActive.length} matching tools are already active: ${alreadyActive.join(', ')}. Call them directly without searching again.`;
    }

    // Return formatted summary — only show newly activated tools in detail
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

  /** Semantic search using embeddings + cosine similarity */
  private async semanticSearch(query: string): Promise<string[]> {
    if (!this.ai || !this.vectorDb) return this.keywordSearch(query);

    try {
      const { embeddings } = await this.ai.embed({ texts: [query] });
      const queryEmbedding = embeddings[0];
      if (!queryEmbedding) return this.keywordSearch(query);

      const results = await this.vectorDb.query({
        table: 'tools',
        values: queryEmbedding,
        limit: this.maxSearchResults,
      });

      // Filter by similarity threshold (distance < 0.5 means cosine similarity > 0.5)
      return results.matches
        .filter((m) => m.score < 0.5)
        .map((m) => m.id);
    } catch {
      // Embedding call failed at search time — fall back to keyword
      return this.keywordSearch(query);
    }
  }

  /** Keyword-based fallback search */
  private keywordSearch(query: string): string[] {
    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/\s+/).filter(Boolean);

    const scored: Array<{ name: string; score: number }> = [];
    for (const name of this.deferredNames) {
      const fn = this.registry.get(name);
      if (!fn) continue;

      const searchText = `${fn.name} ${fn.description ?? ''}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (fn.name.toLowerCase().includes(term)) score += 3;
        if ((fn.description ?? '').toLowerCase().includes(term)) score += 1;
      }
      if (searchText.includes(queryLower)) score += 2;

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
