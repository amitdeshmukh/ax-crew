import { v4 as uuidv4 } from "uuid";
import { AxAgent, AxAI } from "@ax-llm/ax";

import type {
  AxSignature,
  AxAgentic,
  AxFunction,
  AxProgramForwardOptions,
  AxProgramStreamingForwardOptions,
  AxGenStreamingOut,
} from "@ax-llm/ax";

import type {
   StateInstance, 
   FunctionRegistryType, 
   UsageCost, 
   AxCrewConfig,
   AxCrewOptions,
   MCPTransportConfig,
} from "../types.js";

import { createState }   from "../state/index.js";
import { parseCrewConfig, parseAgentConfig } from "./agentConfig.js";
import { MetricsRegistry } from "../metrics/index.js";

// Define the interface for the agent configuration
interface ParsedAgentConfig {
  ai: AxAI;
  name: string;
  description: string;
  definition?: string;
  signature: string | AxSignature;
  functions: (
    | AxFunction
    | (new (state: Record<string, any>) => { toFunction: () => AxFunction })
    | undefined
  )[];
  mcpServers?: Record<string, MCPTransportConfig>;
  subAgentNames: string[];
  examples?: Array<Record<string, any>>;
  tracker?: any;
}

// Extend the AxAgent class from ax-llm
class StatefulAxAgent extends AxAgent<any, any> {
  state: StateInstance;
  axai: any;
  private agentName: string;
  private costTracker?: any;
  private lastRecordedCostUSD: number = 0;
  private isAxAIService(obj: any): obj is AxAI {
    return !!obj && typeof obj.getName === 'function' && typeof obj.chat === 'function';
  }
  private isAxAIInstance(obj: any): obj is AxAI {
    return !!obj && typeof obj === 'object' && ('defaults' in obj || 'modelInfo' in obj);
  }

  constructor(
    ai: AxAI,
    options: Readonly<{
      name: string;
      description: string;
      definition?: string;
      signature: string | AxSignature;
      agents?: AxAgentic<any, any>[] | undefined;
      functions?: (AxFunction | (() => AxFunction))[] | undefined;
      examples?: Array<Record<string, any>> | undefined;
      mcpServers?: Record<string, MCPTransportConfig> | undefined;
    }>,
    state: StateInstance
  ) {
    const { examples, ...restOptions } = options;
    const formattedOptions = {
      ...restOptions,
      functions: restOptions.functions?.map((fn) =>
        typeof fn === "function" ? fn() : fn
      ) as AxFunction[] | undefined,
    };
    super(formattedOptions);
    this.state = state;
    this.axai = ai;
    this.agentName = options.name;

    // Set examples if provided
    if (examples && examples.length > 0) {
      super.setExamples(examples);
    }
  }

  // Function overloads for forward method
  async forward(values: Record<string, any>, options?: Readonly<AxProgramForwardOptions<any>>): Promise<Record<string, any>>;
  async forward(ai: AxAI, values: Record<string, any>, options?: Readonly<AxProgramForwardOptions<any>>): Promise<Record<string, any>>;
  
  // Implementation
  async forward(
    first: Record<string, any> | AxAI,
    second?: Record<string, any> | Readonly<AxProgramForwardOptions<any>>,
    third?: Readonly<AxProgramForwardOptions<any>>
  ): Promise<Record<string, any>> {
    let result;
    
    const start = performance.now();
    const crewId = (this.state as any)?.crewId || (this.state.get?.('crewId')) || 'default';
    const labels = { crewId, agent: this.agentName } as any;

    // Track costs regardless of whether it's a direct or sub-agent call
    // This ensures we capture multiple legitimate calls to the same agent
    if (this.isAxAIService(first)) {
      // Sub-agent case (called with AI service)
      result = await super.forward(this.axai, second as Record<string, any>, third);
    } else {
      // Direct call case
      result = await super.forward(this.axai, first, second as Readonly<AxProgramForwardOptions<any>>);
    }

    // Track metrics and costs after the call using built-in usage
    const durationMs = performance.now() - start;
    MetricsRegistry.recordRequest(labels, false, durationMs);
    // Always record tokens from built-in usage array if present
    const builtIn = (this as any).getUsage?.();
    if (Array.isArray(builtIn)) {
      const totals = builtIn.reduce(
        (acc: any, u: any) => {
          const pt = u.tokens?.promptTokens ?? u.promptTokens ?? 0;
          const ct = u.tokens?.completionTokens ?? u.completionTokens ?? 0;
          acc.promptTokens += typeof pt === 'number' ? pt : 0;
          acc.completionTokens += typeof ct === 'number' ? ct : 0;
          // also aggregate per-model to feed Ax tracker
          const model = u.model || (this.axai as any)?.getLastUsedChatModel?.() || (this.axai as any)?.defaults?.model;
          if (model) {
            acc.byModel[model] = (acc.byModel[model] || 0) + (pt + ct);
          }
          return acc;
        },
        { promptTokens: 0, completionTokens: 0, byModel: {} as Record<string, number> }
      );
      MetricsRegistry.recordTokens(labels, {
        promptTokens: totals.promptTokens,
        completionTokens: totals.completionTokens,
        totalTokens: totals.promptTokens + totals.completionTokens,
      });
      // Feed Ax's cost tracker with token totals per model; Ax owns pricing
      const costTracker = (this as any).costTracker;
      try {
        for (const [m, count] of Object.entries(totals.byModel)) {
          costTracker?.trackTokens?.(count, m);
        }
        const totalUSD = Number(costTracker?.getCurrentCost?.() ?? 0);
        if (!Number.isNaN(totalUSD) && totalUSD > 0) {
          MetricsRegistry.recordEstimatedCost(labels, totalUSD);
        }
      } catch {}
    }

    return result;
  }

  // Add streaming forward method overloads
  streamingForward(values: Record<string, any>, options?: Readonly<AxProgramStreamingForwardOptions<any>>): AxGenStreamingOut<any>;
  streamingForward(ai: AxAI, values: Record<string, any>, options?: Readonly<AxProgramStreamingForwardOptions<any>>): AxGenStreamingOut<any>;
  
  // Implementation
  streamingForward(
    first: Record<string, any> | AxAI,
    second?: Record<string, any> | Readonly<AxProgramStreamingForwardOptions<any>>,
    third?: Readonly<AxProgramStreamingForwardOptions<any>>
  ): AxGenStreamingOut<any> {
    const start = performance.now();
    const crewId = (this.state as any)?.crewId || (this.state.get?.('crewId')) || 'default';
    const labels = { crewId, agent: this.agentName } as any;
    let streamingResult: AxGenStreamingOut<any>;
    
    if (this.isAxAIService(first)) {
      streamingResult = super.streamingForward(this.axai, second as Record<string, any>, third);
    } else {
      streamingResult = super.streamingForward(this.axai, first, second as Readonly<AxProgramStreamingForwardOptions<any>>);
    }

    // Create a new async generator that tracks costs after completion
    const wrappedGenerator = (async function*(this: StatefulAxAgent) {
      try {
        for await (const chunk of streamingResult) {
          yield chunk;
        }
      } finally {
        const durationMs = performance.now() - start;
        MetricsRegistry.recordRequest(labels, true, durationMs);
        // Record tokens from built-in usage array if present
        const builtIn = (this as any).getUsage?.();
        if (Array.isArray(builtIn)) {
          const totals = builtIn.reduce(
            (acc: any, u: any) => {
              const pt = u.tokens?.promptTokens ?? u.promptTokens ?? 0;
              const ct = u.tokens?.completionTokens ?? u.completionTokens ?? 0;
              acc.promptTokens += typeof pt === 'number' ? pt : 0;
              acc.completionTokens += typeof ct === 'number' ? ct : 0;
              const model = u.model || (this.axai as any)?.getLastUsedChatModel?.() || (this.axai as any)?.defaults?.model;
              if (model) {
                acc.byModel[model] = (acc.byModel[model] || 0) + (pt + ct);
              }
              return acc;
            },
            { promptTokens: 0, completionTokens: 0, byModel: {} as Record<string, number> }
          );
          MetricsRegistry.recordTokens(labels, {
            promptTokens: totals.promptTokens,
            completionTokens: totals.completionTokens,
            totalTokens: totals.promptTokens + totals.completionTokens,
          });
          const costTracker = (this as any).costTracker;
          try {
            for (const [m, count] of Object.entries(totals.byModel)) {
              costTracker?.trackTokens?.(count, m);
            }
            const totalUSD = Number(costTracker?.getCurrentCost?.() ?? 0);
            if (!Number.isNaN(totalUSD) && totalUSD > 0) {
              MetricsRegistry.recordEstimatedCost(labels, totalUSD);
            }
          } catch {}
        }
        // Record estimated cost (USD) via attached tracker if available
        const costTracker = (this as any).costTracker;
        try {
          const totalUSD = Number(costTracker?.getCurrentCost?.() ?? 0);
          if (!Number.isNaN(totalUSD) && totalUSD > 0) {
            MetricsRegistry.recordEstimatedCost(labels, totalUSD);
          }
        } catch {}
      }
    }).bind(this)();

    return wrappedGenerator as AxGenStreamingOut<any>;
  }

  // Legacy cost API removed: rely on Ax trackers for cost reporting
  getLastUsageCost(): UsageCost | null { return null; }

  // Get the accumulated costs for all runs of this agent
  getAccumulatedCosts(): UsageCost | null { return null; }

  // Metrics API for this agent
  /**
   * Get the current metrics snapshot for this agent.
   * Includes request counts, error rates, token usage, estimated USD cost, and function call stats.
   *
   * @returns A metrics snapshot scoped to this agent within its crew.
   */
  getMetrics() {
    const crewId = (this.state as any)?.crewId || (this.state.get?.('crewId')) || 'default';
    return MetricsRegistry.snapshot({ crewId, agent: this.agentName } as any);
  }
  /**
   * Reset all tracked metrics for this agent (does not affect other agents).
   * Call this to start fresh measurement windows for the agent.
   */
  resetMetrics(): void {
    const crewId = (this.state as any)?.crewId || (this.state.get?.('crewId')) || 'default';
    MetricsRegistry.reset({ crewId, agent: this.agentName } as any);
  }

}

/**
 * AxCrew orchestrates a set of Ax agents that share state,
 * tools (functions), optional MCP servers, streaming, and a built-in metrics
 * registry for tokens, requests, and estimated cost.
 *
 * Typical usage:
 *  const crew = new AxCrew(config, AxCrewFunctions)
 *  await crew.addAllAgents()
 *  const planner = crew.agents?.get("Planner")
 *  const res = await planner?.forward({ task: "Plan something" })
 *
 * Key behaviors:
 * - Validates and instantiates agents from a config-first model
 * - Shares a mutable state object across all agents in the crew
 * - Supports sub-agents and a function registry per agent
 * - Tracks per-agent and crew-level metrics via MetricsRegistry
 * - Provides helpers to add agents (individually, a subset, or all) and
 *   to reset metrics/costs when needed
 */
class AxCrew {
  private crewConfig: AxCrewConfig;
  private options?: AxCrewOptions;
  functionsRegistry: FunctionRegistryType = {};
  crewId: string;
  agents: Map<string, StatefulAxAgent> | null;
  state: StateInstance;

  /**
   * Creates an instance of AxCrew.
   * @param {AxCrewConfig} crewConfig - JSON object with crew configuration.
   * @param {FunctionRegistryType} [functionsRegistry={}] - The registry of functions to use in the crew.
   * @param {string} [crewId=uuidv4()] - The unique identifier for the crew.
   * @param {AxCrewOptions} [options] - Optional settings for the crew (e.g., telemetry).
   */
  constructor(
    crewConfig: AxCrewConfig,
    functionsRegistry: FunctionRegistryType = {},
    crewId: string = uuidv4(),
    options?: AxCrewOptions
  ) {
    // Basic validation of crew configuration
    if (!crewConfig || typeof crewConfig !== 'object' || !('crew' in crewConfig)) {
      throw new Error('Invalid crew configuration');
    }

    // Validate each agent in the crew
    crewConfig.crew.forEach((agent: any) => {
      if (!agent.name || agent.name.trim() === '') {
        throw new Error('Agent name cannot be empty');
      }
    });

    this.crewConfig = crewConfig;
    this.functionsRegistry = functionsRegistry;
    this.crewId = crewId;
    this.options = options;
    this.agents = new Map<string, StatefulAxAgent>();
    this.state = createState(crewId);
    // Make crewId discoverable to metrics
    this.state.set('crewId', crewId);
  }

  /**
   * Factory function for creating an agent.
   * @param {string} agentName - The name of the agent to create.
   * @returns {StatefulAxAgent} The created StatefulAxAgent instance.
   * @throws Will throw an error if the agent creation fails.
   */
  createAgent = async (agentName: string): Promise<StatefulAxAgent> => {
    try {
      const agentConfig: ParsedAgentConfig = await parseAgentConfig(
        agentName,
        this.crewConfig,
        this.functionsRegistry,
        this.state,
        this.options
      );

      // Destructure with type assertion
      const { ai, name, description, signature, functions, subAgentNames, examples, tracker } = agentConfig;

      // Get subagents for the AI agent
      const subAgents = subAgentNames.map((subAgentName: string) => {
        if (!this.agents?.get(subAgentName)) {
          throw new Error(
            `Sub-agent '${subAgentName}' does not exist in available agents.`
          );
        }
        return this.agents?.get(subAgentName);
      });

      // Dedupe sub-agents by name (defensive)
      const subAgentSet = new Map<string, StatefulAxAgent>();
      for (const sa of subAgents.filter((agent): agent is StatefulAxAgent => agent !== undefined)) {
        const n = (sa as any)?.agentName ?? (sa as any)?.name ?? '';
        if (!subAgentSet.has(n)) subAgentSet.set(n, sa);
      }
      const uniqueSubAgents = Array.from(subAgentSet.values());

      // Dedupe functions by name and avoid collision with sub-agent names
      const subAgentNameSet = new Set(uniqueSubAgents.map((sa: any) => sa?.agentName ?? sa?.name).filter(Boolean));
      const uniqueFunctions: AxFunction[] = [];
      const seenFn = new Set<string>();
      for (const fn of functions.filter((fn): fn is AxFunction => fn !== undefined)) {
        const fnName = fn.name;
        if (subAgentNameSet.has(fnName)) {
          // Skip function that collides with a sub-agent name
          continue;
        }
        if (!seenFn.has(fnName)) {
          seenFn.add(fnName);
          uniqueFunctions.push(fn);
        }
      }

      // Create an instance of StatefulAxAgent
      const agent = new StatefulAxAgent(
        ai,
        {
          name,
          description,
          definition: (agentConfig as any).definition,
          signature,
          functions: uniqueFunctions,
          agents: uniqueSubAgents,
          examples,
        },
        this.state
      );
      (agent as any).costTracker = tracker;

      return agent;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Adds an agent to the crew by name.
   * @param {string} agentName - The name of the agent to add.
   */
  async addAgent(agentName: string): Promise<void> {
    try {
      if (!this.agents) {
        this.agents = new Map<string, StatefulAxAgent>();
      }
      if (!this.agents.has(agentName)) {
        this.agents.set(agentName, await this.createAgent(agentName));
      }
      if (this.agents && !this.agents.has(agentName)) {
        this.agents.set(agentName, await this.createAgent(agentName));
      }
    } catch (error) {
      console.error(`Failed to create agent '${agentName}':`);
      throw new Error(`Failed to add agent ${agentName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sets up agents in the crew by name.
   * For an array of Agent names provided, it adds
   * the agent to the crew if not already present.
   * @param {string[]} agentNames - An array of agent names to configure.
   * @returns {Map<string, StatefulAxAgent> | null} A map of agent names to their corresponding instances.
   */
  async addAgentsToCrew(agentNames: string[]): Promise<Map<string, StatefulAxAgent> | null> {
    try {
      // Parse the crew config to get agent dependencies
      const parsedConfig = parseCrewConfig(this.crewConfig);
      const dependencyMap = new Map<string, string[]>();
      parsedConfig.crew.forEach(agent => {
        dependencyMap.set(agent.name, agent.agents || []);
      });

      // Function to check if all dependencies are initialized
      const areDependenciesInitialized = (agentName: string): boolean => {
        const dependencies = dependencyMap.get(agentName) || [];
        return dependencies.every(dep => this.agents?.has(dep));
      };

      // Initialize agents sequentially based on dependencies
      const initializedAgents = new Set<string>();
      
      while (initializedAgents.size < agentNames.length) {
        let madeProgress = false;

        for (const agentName of agentNames) {
          // Skip if already initialized
          if (initializedAgents.has(agentName)) continue;

          // Check if all dependencies are initialized
          if (areDependenciesInitialized(agentName)) {
            await this.addAgent(agentName);
            initializedAgents.add(agentName);
            madeProgress = true;
          }
        }

        // If we couldn't initialize any agents in this iteration, we have a circular dependency
        if (!madeProgress) {
          const remaining = agentNames.filter(agent => !initializedAgents.has(agent));
          throw new Error(`Failed to initialize agents due to missing dependencies: ${remaining.join(', ')}`);
        }
      }

      return this.agents;
    } catch (error) {
      throw error;
    }
  }

  async addAllAgents(): Promise<Map<string, StatefulAxAgent> | null> {
    try {
      // Parse the crew config and get all agent configs
      const parsedConfig = parseCrewConfig(this.crewConfig);
      
      // Create a map of agent dependencies
      const dependencyMap = new Map<string, string[]>();
      parsedConfig.crew.forEach(agent => {
        dependencyMap.set(agent.name, agent.agents || []);
      });

      // Function to check if all dependencies are initialized
      const areDependenciesInitialized = (agentName: string): boolean => {
        const dependencies = dependencyMap.get(agentName) || [];
        return dependencies.every(dep => this.agents?.has(dep));
      };

      // Get all agent names
      const allAgents = parsedConfig.crew.map(agent => agent.name);
      const initializedAgents = new Set<string>();

      // Keep trying to initialize agents until all are done or we can't make progress
      while (initializedAgents.size < allAgents.length) {
        let madeProgress = false;

        for (const agentName of allAgents) {
          // Skip if already initialized
          if (initializedAgents.has(agentName)) continue;

          // Check if all dependencies are initialized
          if (areDependenciesInitialized(agentName)) {
            await this.addAgent(agentName);
            initializedAgents.add(agentName);
            madeProgress = true;
          }
        }

        // If we couldn't initialize any agents in this iteration, we have a circular dependency
        if (!madeProgress) {
          const remaining = allAgents.filter(agent => !initializedAgents.has(agent));
          throw new Error(`Circular dependency detected or missing dependencies for agents: ${remaining.join(', ')}`);
        }
      }

      return this.agents;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Cleans up the crew by dereferencing agents and resetting the state.
   */
  destroy() {
    this.agents = null;
    this.state.reset();
  }


  /**
   * Resets all cost and usage tracking for the entire crew.
   * Also calls each agent's `resetUsage` (if available) and clears crew-level metrics.
   */
  resetCosts(): void {
    // Reset AxAgent built-in usage and our metrics registry
    if (this.agents) {
      for (const [, agent] of this.agents) {
        try { (agent as any).resetUsage?.(); } catch {}
        try { (agent as any).resetMetrics?.(); } catch {}
      }
    }
    MetricsRegistry.reset({ crewId: this.crewId });
  }

  // Metrics API
  /**
   * Get an aggregate metrics snapshot for the entire crew.
   * Sums requests, errors, tokens, and estimated cost across all agents in the crew.
   *
   * @returns Crew-level metrics snapshot.
   */
  getCrewMetrics() {
    return MetricsRegistry.snapshotCrew(this.crewId);
  }
  /**
   * Reset all tracked metrics for the entire crew.
   * Use to clear totals before a new measurement period.
   */
  resetCrewMetrics(): void {
    MetricsRegistry.reset({ crewId: this.crewId });
  }
}

export { AxCrew };
export type { StatefulAxAgent };