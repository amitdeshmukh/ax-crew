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
 */
export class DeferredToolManager {
  private registry: Map<string, AxFunction>;
  private deferredNames: Set<string>;
  private activatedNames: Set<string>;
  private coreNames: Set<string>;
  private readonly maxSearchResults: number;
  private readonly _isActive: boolean;
  private resourceCache: Map<string, unknown>;

  constructor(
    allFunctions: readonly AxFunction[],
    mcpFunctionNames: ReadonlySet<string>,
    config?: DeferredToolsConfig
  ) {
    const threshold = config?.threshold ?? DEFAULT_THRESHOLD;
    this.maxSearchResults = config?.maxSearchResults ?? DEFAULT_MAX_RESULTS;
    this.activatedNames = new Set();
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

  /**
   * Get step hooks for dynamic tool activation.
   * - beforeStep: re-injects previously activated tools at the start of each
   *   forward() call so tools discovered in earlier calls persist.
   * - afterFunctionExecution: injects newly discovered tools after search_tools
   *   runs, and auto-activates tools mentioned in function results.
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
        if (this.activatedNames.size > 0) {
          injectActivated(ctx as any);
        }
      },
      afterFunctionExecution: async (ctx) => {
        if (ctx.functionsExecuted.has('search_tools')) {
          injectActivated(ctx);
        }

        // Auto-activate deferred tools mentioned in function results.
        // Handles cases where a tool error suggests using another tool
        // (e.g., GraphJin's "recommended_tool": "fix_query_error").
        this.autoActivateFromResults(ctx.lastFunctionCalls);
        injectActivated(ctx);
      },
    };
  }

  /** Scan function results for mentions of deferred tool names and auto-activate them. */
  private autoActivateFromResults(
    functionCalls: readonly { readonly name: string; readonly result: unknown }[] | undefined
  ): void {
    if (!functionCalls || functionCalls.length === 0 || this.deferredNames.size === 0) return;

    for (const call of functionCalls) {
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

  /** Search deferred tools by keyword matching on name + description */
  private search(query: string): string {
    const queryLower = query.toLowerCase();
    const terms = queryLower.split(/[\s_\-./]+/).filter(t => t.length > 1);

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
    const matchedNames = scored.slice(0, this.maxSearchResults).map(s => s.name);

    if (matchedNames.length === 0) {
      const names = Array.from(this.deferredNames).slice(0, 30);
      return `No tools found matching "${query}". Available tools: ${names.join(', ')}${this.deferredNames.size > 30 ? '...' : ''}`;
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

    if (newlyActivated.length === 0) {
      return `All ${alreadyActive.length} matching tools are already active: ${alreadyActive.join(', ')}. Call them directly.`;
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
