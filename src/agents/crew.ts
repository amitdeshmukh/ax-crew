import { v4 as uuidv4 } from "uuid";
import type { AxFunction } from "@ax-llm/ax";

import type {
   StateInstance,
   FunctionRegistryType,
   AxCrewConfig,
   AxCrewOptions,
   ACEConfig,
   DeferredToolsConfig,
} from "../types.js";

import { createState } from "../state/index.js";
import { parseCrewConfig, parseAgentConfig } from "./agentConfig.js";
import { DeferredToolManager } from "./deferredTools.js";
import { MetricsRegistry } from "../metrics/index.js";
import { StatefulAxAgent } from "./statefulAgent.js";
import type { ParsedAgentConfig } from "./statefulAgent.js";
import { LazyStatefulAxAgent } from "./lazyAgent.js";

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
  crewState: StateInstance;
  // Cached AI instance for embeddings (resolved from Manager or first agent)
  private embeddingAi: any | null = null;
  // Execution history for ACE feedback routing
  private executionHistory: Map<string, {
    taskId: string;
    rootAgent: string;
    involvedAgents: Set<string>;
    taskInput: any;
    agentResults: Map<string, any>;
    startTime: number;
    endTime?: number;
  }> = new Map();

  constructor(
    crewConfig: AxCrewConfig,
    functionsRegistry: FunctionRegistryType = {},
    options?: AxCrewOptions,
    crewId: string = uuidv4(),
  ) {
    if (!crewConfig || typeof crewConfig !== 'object' || !('crew' in crewConfig)) {
      throw new Error('Invalid crew configuration');
    }

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
    this.crewState = createState(crewId);
    this.crewState.set('crewId', crewId);
  }

  /**
   * Resolve an AI service for embeddings.
   * Uses the Manager agent's AI if configured, otherwise the first agent's AI.
   * Caches the result for reuse across all DeferredToolManagers in this crew.
   */
  private resolveEmbeddingAi(): any | null {
    if (this.embeddingAi) return this.embeddingAi;

    if (this.agents && this.agents.size > 0) {
      // Prefer Manager agent
      for (const [name, agent] of this.agents) {
        if (name.toLowerCase().includes('manager')) {
          this.embeddingAi = (agent as any).axai;
          return this.embeddingAi;
        }
      }
      // Fall back to first agent
      const first = this.agents.values().next().value;
      if (first) {
        this.embeddingAi = (first as any).axai;
        return this.embeddingAi;
      }
    }

    return null;
  }

  /**
   * Factory function for creating an agent.
   */
  createAgent = async (agentName: string): Promise<StatefulAxAgent> => {
    try {
      const agentConfig: ParsedAgentConfig = await parseAgentConfig(
        agentName,
        this.crewConfig,
        this.functionsRegistry,
        this.crewState,
        this.options
      );

      const { ai, name, executionMode, axAgentOptions, description, signature, functions, subAgentNames, examples, tracker } = agentConfig;

      // Get subagents for the AI agent
      const subAgents = subAgentNames.map((subAgentName: string) => {
        if (!this.agents?.get(subAgentName)) {
          throw new Error(
            `Sub-agent '${subAgentName}' does not exist in available agents.`
          );
        }
        return this.agents?.get(subAgentName);
      });

      // Dedupe sub-agents by name
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
        if (subAgentNameSet.has(fnName)) continue;
        if (!seenFn.has(fnName)) {
          seenFn.add(fnName);
          uniqueFunctions.push(fn);
        }
      }

      // Resolve factory functions into AxFunction objects
      const resolvedFunctions: AxFunction[] = uniqueFunctions.map(fn =>
        typeof fn === 'function' ? (fn as () => AxFunction)() : fn
      );

      // Wrap each function handler to record call count and latency
      const crewId = this.crewId;
      const agentNameForMetrics = name;
      const instrumentedFunctions: AxFunction[] = resolvedFunctions.map(fn => ({
        ...fn,
        func: async (args?: any, extra?: any) => {
          const fnStart = performance.now();
          try {
            return await fn.func(args, extra);
          } finally {
            const latencyMs = performance.now() - fnStart;
            MetricsRegistry.recordFunctionCall(
              { crewId, agent: agentNameForMetrics },
              latencyMs,
              fn.name
            );
          }
        },
      }));

      // Deferred tool loading
      const mcpFnNames: ReadonlySet<string> = (agentConfig as any).mcpFunctionNames ?? new Set();
      const deferredConfig: DeferredToolsConfig | undefined = (agentConfig as any).deferredTools;
      const deferredManager = new DeferredToolManager(instrumentedFunctions, mcpFnNames, deferredConfig);
      const effectiveFunctions = deferredManager.isActive
        ? deferredManager.getInitialFunctions()
        : instrumentedFunctions;

      if (deferredManager.isActive) {
        const embeddingAi = this.resolveEmbeddingAi() ?? ai;
        await deferredManager.initSemanticSearch(embeddingAi);

        console.log(
          `[ax-crew] Deferred tool loading active for "${name}": ` +
          `${effectiveFunctions.length} core + search_tools, ` +
          `${instrumentedFunctions.length - effectiveFunctions.length + 1} deferred`
        );
      }

      // Create the agent
      const agentState = { ...this.crewState, crew: this };
      const agent = new StatefulAxAgent(
        ai,
        {
          name,
          executionMode,
          axAgentOptions,
          description,
          definition: (agentConfig as any).definition,
          signature,
          functions: effectiveFunctions,
          agents: uniqueSubAgents,
          examples,
          debug: (agentConfig as any).debug,
        },
        agentState as StateInstance
      );
      (agent as any).costTracker = tracker;
      if (deferredManager.isActive) {
        (agent as any).deferredToolManager = deferredManager;
      }
      (agent as any).__functionsRegistry = this.functionsRegistry;

      // Initialize ACE if configured
      try {
        const crewAgent = parseCrewConfig(this.crewConfig).crew.find(a => a.name === name) as any;
        const ace: ACEConfig | undefined = crewAgent?.ace;
        if (ace) {
          await (agent as any).initACE?.(ace);
          if (ace.compileOnStart) {
            const { resolveMetric } = await import('./ace.js');
            const metric = resolveMetric(ace.metric, this.functionsRegistry);
            await (agent as any).optimizeOffline?.({ metric, examples });
          }
        }
      } catch {}

      return agent;
    } catch (error) {
      throw error;
    }
  };

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

  addLazyAgent(agentName: string): void {
    if (!this.agents) {
      this.agents = new Map<string, StatefulAxAgent>();
    }
    if (!this.agents.has(agentName)) {
      this.agents.set(
        agentName,
        new LazyStatefulAxAgent(this, agentName, this.crewConfig) as any
      );
    }
  }

  async addAgentsToCrew(agentNames: string[]): Promise<Map<string, StatefulAxAgent> | null> {
    try {
      const parsedConfig = parseCrewConfig(this.crewConfig);
      const dependencyMap = new Map<string, string[]>();
      parsedConfig.crew.forEach(agent => {
        dependencyMap.set(agent.name, agent.agents || []);
      });

      const areDependenciesInitialized = (agentName: string): boolean => {
        const dependencies = dependencyMap.get(agentName) || [];
        return dependencies.every(dep => this.agents?.has(dep));
      };

      const initializedAgents = new Set<string>();

      while (initializedAgents.size < agentNames.length) {
        let madeProgress = false;

        for (const agentName of agentNames) {
          if (initializedAgents.has(agentName)) continue;
          if (areDependenciesInitialized(agentName)) {
            await this.addAgent(agentName);
            initializedAgents.add(agentName);
            madeProgress = true;
          }
        }

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
      const parsedConfig = parseCrewConfig(this.crewConfig);

      const dependencyMap = new Map<string, string[]>();
      parsedConfig.crew.forEach(agent => {
        dependencyMap.set(agent.name, agent.agents || []);
      });

      const areDependenciesInitialized = (agentName: string): boolean => {
        const dependencies = dependencyMap.get(agentName) || [];
        return dependencies.every(dep => this.agents?.has(dep));
      };

      const allAgents = parsedConfig.crew.map(agent => agent.name);
      const initializedAgents = new Set<string>();

      while (initializedAgents.size < allAgents.length) {
        let madeProgress = false;

        for (const agentName of allAgents) {
          if (initializedAgents.has(agentName)) continue;
          if (areDependenciesInitialized(agentName)) {
            await this.addAgent(agentName);
            initializedAgents.add(agentName);
            madeProgress = true;
          }
        }

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

  // === ACE execution tracking ===

  trackAgentExecution(taskId: string, agentName: string, input: any): void {
    if (!this.executionHistory.has(taskId)) {
      this.executionHistory.set(taskId, {
        taskId,
        rootAgent: agentName,
        involvedAgents: new Set([agentName]),
        taskInput: input,
        agentResults: new Map(),
        startTime: Date.now()
      });
    } else {
      const context = this.executionHistory.get(taskId)!;
      context.involvedAgents.add(agentName);
    }
  }

  recordAgentResult(taskId: string, agentName: string, result: any): void {
    const context = this.executionHistory.get(taskId);
    if (context) {
      context.agentResults.set(agentName, result);
      context.endTime = Date.now();
    }
  }

  getTaskAgentInvolvement(taskId: string): {
    rootAgent: string;
    involvedAgents: string[];
    taskInput: any;
    agentResults: Map<string, any>;
    duration?: number;
  } | null {
    const context = this.executionHistory.get(taskId);
    if (!context) return null;

    return {
      rootAgent: context.rootAgent,
      involvedAgents: Array.from(context.involvedAgents),
      taskInput: context.taskInput,
      agentResults: context.agentResults,
      duration: context.endTime ? context.endTime - context.startTime : undefined
    };
  }

  async applyTaskFeedback(params: {
    taskId: string;
    feedback: string;
    strategy?: 'all' | 'primary' | 'weighted';
  }): Promise<void> {
    const involvement = this.getTaskAgentInvolvement(params.taskId);
    if (!involvement) {
      console.warn(`No execution history found for task ${params.taskId}`);
      return;
    }

    const { involvedAgents, taskInput, agentResults } = involvement;
    const strategy = params.strategy || 'all';

    let agentsToUpdate: string[] = [];
    if (strategy === 'primary') {
      agentsToUpdate = [involvement.rootAgent];
    } else if (strategy === 'all' || strategy === 'weighted') {
      agentsToUpdate = involvedAgents;
    }

    for (const agentName of agentsToUpdate) {
      const agent = this.agents?.get(agentName);
      if (agent && typeof (agent as any).applyOnlineUpdate === 'function') {
        try {
          await (agent as any).applyOnlineUpdate({
            example: taskInput,
            prediction: agentResults.get(agentName),
            feedback: params.feedback
          });
        } catch (error) {
          console.warn(`Failed to apply ACE feedback to agent ${agentName}:`, error);
        }
      }
    }
  }

  cleanupOldExecutions(maxAgeMs: number = 3600000): void {
    const cutoffTime = Date.now() - maxAgeMs;
    for (const [taskId, context] of this.executionHistory) {
      if (context.startTime < cutoffTime) {
        this.executionHistory.delete(taskId);
      }
    }
  }

  // === Lifecycle ===

  destroy() {
    this.agents = null;
    this.executionHistory.clear();
    this.crewState.reset();
  }

  // === Metrics ===

  resetCosts(): void {
    if (this.agents) {
      for (const [, agent] of this.agents) {
        try { (agent as any).resetUsage?.(); } catch {}
        try { (agent as any).resetMetrics?.(); } catch {}
      }
    }
    MetricsRegistry.reset({ crewId: this.crewId });
  }

  getCrewMetrics() {
    return MetricsRegistry.snapshotCrew(this.crewId);
  }

  resetCrewMetrics(): void {
    MetricsRegistry.reset({ crewId: this.crewId });
  }
}

export { AxCrew };
