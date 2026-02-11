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
   ACEConfig,
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
  private debugEnabled: boolean = false;
  // ACE-related optional state
  private aceConfig?: ACEConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private aceOptimizer?: any;
  private acePlaybook?: any;
  private aceBaseInstruction?: string; // Original description before playbook injection
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
      debug?: boolean;
    }>,
    state: StateInstance
  ) {
    const { examples, debug, ...restOptions } = options;
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
    this.debugEnabled = debug ?? false;

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
    const input = this.isAxAIService(first) ? second : first;
    const taskId = `task_${crewId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Track execution context in crew for ACE feedback routing
    const crewInstance = (this.state as any)?.crew as AxCrew;
    if (crewInstance) {
      if (this.isAxAIService(first)) {
        // For sub-agent calls, track under parent task ID
        const parentTaskId = (this.state as any)?.currentTaskId;
        if (parentTaskId) {
          crewInstance.trackAgentExecution(parentTaskId, this.agentName, input);
        }
      } else {
        // Root-level call - start new execution tracking
        crewInstance.trackAgentExecution(taskId, this.agentName, input);
        (this.state as any).currentTaskId = taskId;
      }
    }

    // Before forward: compose instruction with current playbook (mirrors AxACE.compile behavior)
    // This ensures the agent uses the latest playbook context for this call
    if (this.debugEnabled) {
      console.log(`[ACE Debug] forward() called, aceConfig=${!!this.aceConfig}`);
    }
    if (this.aceConfig) {
      await this.composeInstructionWithPlaybook();
    }

    // Execute the forward call
    // Note: OpenTelemetry spans are automatically created by AxAI (configured via AxCrewOptions.telemetry)
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

    // Record result in crew execution history for ACE feedback routing
    if (crewInstance) {
      if (this.isAxAIService(first)) {
        // For sub-agent calls, record under parent task ID
        const parentTaskId = (this.state as any)?.currentTaskId;
        if (parentTaskId) {
          crewInstance.recordAgentResult(parentTaskId, this.agentName, result);
        }
      } else {
        // Root-level result - include taskId for feedback routing
        crewInstance.recordAgentResult(taskId, this.agentName, result);
        // Clean up current task ID
        delete (this.state as any).currentTaskId;
        // Attach taskId to result for feedback routing convenience
        result._taskId = taskId;
      }
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

  // =============
  // ACE API - Agentic Context Engineering for online learning
  // Reference: https://axllm.dev/ace/
  // =============
  
  /**
   * Initialize ACE (Agentic Context Engineering) for this agent.
   * Builds the optimizer and loads any initial playbook from persistence.
   * Sets up the optimizer for online-only mode if compileOnStart is false.
   */
  async initACE(ace?: ACEConfig): Promise<void> {
    this.aceConfig = ace;
    if (!ace) return;
    try {
      // Capture base instruction BEFORE any playbook injection (mirrors AxACE.extractProgramInstruction)
      this.aceBaseInstruction = this.getSignature().getDescription() || '';
      
      const { buildACEOptimizer, loadInitialPlaybook, createEmptyPlaybook } = await import('./ace.js');
      // Build optimizer with agent's AI as student
      this.aceOptimizer = buildACEOptimizer(this.axai, ace);
      
      // For online-only mode (no offline compile), we need to set the program
      // reference so applyOnlineUpdate can work. AxACE requires compile() to
      // set the program, but we can set it directly for online-only use.
      if (!ace.compileOnStart) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.aceOptimizer as any).program = this;
      }
      
      // Load initial playbook or create empty one
      const initial = await loadInitialPlaybook(ace.persistence);
      this.applyPlaybook(initial ?? createEmptyPlaybook());
      
      if (this.debugEnabled) {
        console.log(`[ACE Debug] Initialized for ${this.agentName}, base instruction: ${this.aceBaseInstruction?.slice(0, 50)}...`);
      }
    } catch (error) {
      console.warn(`Failed to initialize ACE for agent ${this.agentName}:`, error);
    }
  }

  /**
   * Run offline ACE compilation with examples and metric.
   * Compiles the playbook based on training examples.
   */
  async optimizeOffline(params?: { metric?: any; examples?: any[] }): Promise<void> {
    if (!this.aceConfig || !this.aceOptimizer) return;
    try {
      const { runOfflineCompile, resolveMetric } = await import('./ace.js');
      const registry = (this as any).__functionsRegistry as FunctionRegistryType | undefined;
      const metric = params?.metric || resolveMetric(this.aceConfig.metric, registry || {} as any);
      const examples = params?.examples || [];
      
      if (!metric || examples.length === 0) {
        console.warn(`ACE offline compile skipped for ${this.agentName}: missing metric or examples`);
        return;
      }
      
      const result = await runOfflineCompile({ 
        program: this, 
        optimizer: this.aceOptimizer, 
        metric, 
        examples, 
        persistence: this.aceConfig.persistence 
      });
      
      // Apply optimized playbook if compilation succeeded
      if (result?.artifact?.playbook) {
        await this.applyPlaybook(result.artifact.playbook);
      }
    } catch (error) {
      console.warn(`ACE offline compile failed for ${this.agentName}:`, error);
    }
  }

  /**
   * Apply online ACE update based on user feedback.
   * 
   * For preference-based feedback (e.g., "only show flights between 9am-12pm"),
   * we use our own feedback analyzer that preserves specificity.
   * 
   * Note: AxACE's built-in curator is designed for error correction (severity mismatches)
   * and tends to over-abstract preference feedback into generic guidelines.
   * We bypass it and directly use our feedback analyzer for better results.
   */
  async applyOnlineUpdate(params: { example: any; prediction: any; feedback?: string }): Promise<void> {
    if (!this.aceConfig) return;
    if (!params.feedback?.trim()) return; // Nothing to do without feedback
    
    try {
      const { persistPlaybook, addFeedbackToPlaybook, createEmptyPlaybook } = await import('./ace.js');
      
      // Get or create playbook
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let playbook = this.acePlaybook ?? (this.aceOptimizer as any)?.playbook;
      if (!playbook) {
        playbook = createEmptyPlaybook();
      }
      
      if (this.debugEnabled) {
        console.log(`[ACE Debug] Adding feedback to playbook: "${params.feedback}"`);
      }
      
      // Use teacher AI (or student AI as fallback) for smart categorization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const teacherAI = (this.aceOptimizer as any)?.teacherAI;
      const aiForAnalysis = teacherAI ?? this.axai;
      
      // Directly add feedback to playbook using our analyzer (preserves specificity)
      await addFeedbackToPlaybook(playbook, params.feedback, aiForAnalysis, this.debugEnabled);
      
      // Store updated playbook (injection happens in next forward() call)
      this.applyPlaybook(playbook);
      
      // Sync with optimizer if available
      if (this.aceOptimizer) {
        (this.aceOptimizer as any).playbook = playbook;
      }
      
      // Persist if auto-persist enabled
      if (this.aceConfig.persistence?.autoPersist) {
        await persistPlaybook(playbook, this.aceConfig.persistence);
      }
      
      if (this.debugEnabled) {
        console.log(`[ACE Debug] Playbook updated, sections: ${Object.keys(playbook.sections || {}).join(', ')}`);
      }
    } catch (error) {
      console.warn(`ACE online update failed for ${this.agentName}:`, error);
    }
  }

  /**
   * Get the current ACE playbook for this agent.
   */
  getPlaybook(): any | undefined { 
    return this.acePlaybook; 
  }
  
  /**
   * Apply an ACE playbook to this agent.
   * Stores the playbook for use in next forward() call.
   * Note: Playbook is composed into instruction BEFORE each forward(), mirroring AxACE.compile behavior.
   */
  applyPlaybook(pb: any): void {
    this.acePlaybook = pb;
    
    // Also update optimizer's internal playbook if possible
    try { 
      (this.aceOptimizer as any).playbook = pb;
    } catch {
      // Ignore - optimizer may not be initialized yet
    }
  }
  
  /**
   * Compose instruction with current playbook and set on agent.
   * This mirrors what AxACE does internally before each forward() during compile().
   * Should be called BEFORE forward() to ensure playbook is in the prompt.
   */
  private async composeInstructionWithPlaybook(): Promise<void> {
    const playbook = this.acePlaybook ?? (this.aceOptimizer as any)?.playbook;
    
    if (this.debugEnabled) {
      console.log(`[ACE Debug] composeInstructionWithPlaybook called`);
      console.log(`[ACE Debug] playbook exists: ${!!playbook}, sections: ${playbook ? Object.keys(playbook.sections || {}).length : 0}`);
      console.log(`[ACE Debug] baseInstruction: "${this.aceBaseInstruction?.slice(0, 50)}..."`);
    }
    
    if (!playbook) return;
    
    try {
      const { renderPlaybook } = await import('./ace.js');
      const rendered = renderPlaybook(playbook);
      
      if (this.debugEnabled) {
        console.log(`[ACE Debug] rendered playbook (${rendered.length} chars): ${rendered.slice(0, 100)}...`);
      }
      
      if (!rendered) return;
      
      // Compose: base instruction + playbook (just like AxACE.composeInstruction)
      const baseInstruction = this.aceBaseInstruction || '';
      const combinedInstruction = [baseInstruction.trim(), '', rendered]
        .filter((part) => part.trim().length > 0)
        .join('\n\n');
      
      if (this.debugEnabled) {
        console.log(`[ACE Debug] combinedInstruction (${combinedInstruction.length} chars)`);
      }
      
      if (combinedInstruction.length >= 20) {
        // Call setDescription on the internal program (like AxACE does)
        // AxAgent.setDescription() only updates the signature, but we need
        // to update the program's description which is used for the system prompt
        const program = (this as any).program;
        if (program?.setDescription) {
          program.setDescription(combinedInstruction);
        }
        // Also update via AxAgent's setDescription for consistency
        this.setDescription(combinedInstruction);
        
        if (this.debugEnabled) {
          console.log(`[ACE Debug] setDescription called successfully`);
          console.log(`[ACE Debug] Verifying - signature desc length: ${this.getSignature().getDescription()?.length}`);
        }
      }
    } catch (error) {
      console.warn('[ACE Debug] Failed to compose instruction:', error);
    }
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

  /**
   * Creates an instance of AxCrew.
   * @param {AxCrewConfig} crewConfig - JSON object with crew configuration.
   * @param {FunctionRegistryType} [functionsRegistry={}] - The registry of functions to use in the crew.
   * @param {AxCrewOptions} [options] - Optional settings for the crew (e.g., telemetry).
   * @param {string} [crewId=uuidv4()] - The unique identifier for the crew.
   */
  constructor(
    crewConfig: AxCrewConfig,
    functionsRegistry: FunctionRegistryType = {},
    options?: AxCrewOptions,
    crewId: string = uuidv4(),
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

      // Wrap each function handler to record call count and latency in MetricsRegistry
      const crewId = this.crewId;
      const agentNameForMetrics = name;
      const instrumentedFunctions: AxFunction[] = uniqueFunctions.map(fn => ({
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

      // Create an instance of StatefulAxAgent
      // Set crew reference in state for execution tracking (ACE feedback routing)
      const agentState = { ...this.state, crew: this };
      const agent = new StatefulAxAgent(
        ai,
        {
          name,
          description,
          definition: (agentConfig as any).definition,
          signature,
          functions: instrumentedFunctions,
          agents: uniqueSubAgents,
          examples,
          debug: (agentConfig as any).debug,
        },
        agentState as StateInstance
      );
      (agent as any).costTracker = tracker;
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
   * Track agent execution for ACE feedback routing
   */
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
      // Add to involved agents if not already present
      const context = this.executionHistory.get(taskId)!;
      context.involvedAgents.add(agentName);
    }
  }

  /**
   * Record agent result for ACE feedback routing
   */
  recordAgentResult(taskId: string, agentName: string, result: any): void {
    const context = this.executionHistory.get(taskId);
    if (context) {
      context.agentResults.set(agentName, result);
      context.endTime = Date.now();
    }
  }

  /**
   * Get agent involvement for a task (used for ACE feedback routing)
   */
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

  /**
   * Apply feedback to agents involved in a task for ACE online learning
   */
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

    // Determine which agents to update based on strategy
    let agentsToUpdate: string[] = [];
    if (strategy === 'primary') {
      agentsToUpdate = [involvement.rootAgent];
    } else if (strategy === 'all' || strategy === 'weighted') {
      agentsToUpdate = involvedAgents;
    }

    // Apply feedback to each involved agent
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

  /**
   * Clean up old execution history (call periodically to prevent memory leaks)
   */
  cleanupOldExecutions(maxAgeMs: number = 3600000): void { // Default 1 hour
    const cutoffTime = Date.now() - maxAgeMs;
    for (const [taskId, context] of this.executionHistory) {
      if (context.startTime < cutoffTime) {
        this.executionHistory.delete(taskId);
      }
    }
  }

  /**
   * Cleans up the crew by dereferencing agents and resetting the state.
   */
  destroy() {
    this.agents = null;
    this.executionHistory.clear();
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
