import { AxAgent, AxAI, AxGen } from "@ax-llm/ax";

import type {
  AxSignature,
  AxAgentic,
  AxFunction,
  AxProgramForwardOptions,
  AxProgramStreamingForwardOptions,
  AxGenStreamingOut,
  AxStepHooks,
} from "@ax-llm/ax";

import type {
   StateInstance,
   FunctionRegistryType,
   UsageCost,
   MCPTransportConfig,
   ACEConfig,
   AgentExecutionMode,
   AxCrewAxAgentOptions,
} from "../types.js";

import type { AxCrew } from "./crew.js";
import { DeferredToolManager } from "./deferredTools.js";
import { MetricsRegistry } from "../metrics/index.js";

// Define the interface for the agent configuration
export interface ParsedAgentConfig {
  ai: AxAI;
  name: string;
  executionMode: AgentExecutionMode;
  axAgentOptions?: AxCrewAxAgentOptions;
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
  crewState: StateInstance;
  axai: any;
  private agentName: string;
  private agentDefinition: string;
  private executionMode: AgentExecutionMode;
  private axGenProgram: AxGen<any, any>;
  private costTracker?: any;
  private debugEnabled: boolean = false;
  private deferredToolManager?: DeferredToolManager;
  private static readonly modernAxAgentRuntime =
    typeof (AxAgent as any)?.prototype?.getFunction === "function" &&
    typeof (AxAgent as any)?.prototype?.setExamples !== "function";
  // ACE-related optional state
  private aceConfig?: ACEConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private aceOptimizer?: any;
  private acePlaybook?: any;
  private aceBaseInstruction?: string; // Original description before playbook injection
  private isAxAIService(obj: any): obj is AxAI {
    return !!obj && typeof obj.getName === 'function' && typeof obj.chat === 'function';
  }

  constructor(
    ai: AxAI,
    options: Readonly<{
      name: string;
      description: string;
      executionMode?: AgentExecutionMode;
      axAgentOptions?: AxCrewAxAgentOptions;
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
    const { examples, debug } = options;
    const resolvedFunctions = (options.functions ?? []).map((fn) =>
      typeof fn === "function" ? fn() : fn
    ) as AxFunction[];
    const resolvedAgents = (options.agents ?? []) as AxAgentic<any, any>[];
    const effectiveDefinition = (options.definition ?? options.description).trim();

    if (StatefulAxAgent.modernAxAgentRuntime) {
      const configuredAgentOptions = (options.axAgentOptions ?? {}) as Record<string, any>;
      const configuredAgentGraph = (configuredAgentOptions.agents ?? {}) as Record<string, any>;
      const configuredFunctionGraph = (configuredAgentOptions.functions ?? {}) as Record<string, any>;
      const configuredActorOptions = (configuredAgentOptions.actorOptions ?? {}) as Record<string, any>;
      const configuredResponderOptions = (configuredAgentOptions.responderOptions ?? {}) as Record<string, any>;

      const modernOptions: Record<string, unknown> = {
        ...configuredAgentOptions,
        debug: debug ?? configuredAgentOptions.debug ?? false,
        contextFields: Array.isArray(configuredAgentOptions.contextFields)
          ? configuredAgentOptions.contextFields
          : [],
      };

      modernOptions.agents = {
        ...configuredAgentGraph,
        local: resolvedAgents,
      };
      modernOptions.functions = {
        ...configuredFunctionGraph,
        local: resolvedFunctions,
      };

      if (effectiveDefinition.length > 0) {
        modernOptions.actorOptions = {
          ...configuredActorOptions,
          description: configuredActorOptions.description ?? effectiveDefinition,
        };
        modernOptions.responderOptions = {
          ...configuredResponderOptions,
          description: configuredResponderOptions.description ?? effectiveDefinition,
        };
      } else {
        modernOptions.actorOptions = configuredActorOptions;
        modernOptions.responderOptions = configuredResponderOptions;
      }

      super(
        {
          ai,
          agentIdentity: {
            name: options.name,
            description: options.description,
          },
          signature: options.signature as any,
        } as any,
        modernOptions as any
      );
    } else {
      super(
        {
          name: options.name,
          description: options.description,
          definition: options.definition,
          signature: options.signature,
          agents: resolvedAgents,
          functions: resolvedFunctions,
          debug: debug ?? false,
        } as any,
        {} as any
      );
    }

    this.crewState = state;
    this.axai = ai;
    this.agentName = options.name;
    this.agentDefinition = effectiveDefinition;
    this.executionMode = options.executionMode ?? "axgen";
    this.debugEnabled = debug ?? false;
    // Convert sub-agents to callable functions so AxGen can invoke them as tools
    const subAgentFunctions: AxFunction[] = resolvedAgents
      .map(agent => {
        try { return agent.getFunction() as AxFunction; }
        catch { return undefined; }
      })
      .filter((fn): fn is AxFunction => fn !== undefined);

    this.axGenProgram = new AxGen(options.signature as any, {
      description: effectiveDefinition,
      functions: [...resolvedFunctions, ...subAgentFunctions],
    } as any);

    for (const agent of resolvedAgents) {
      try {
        const childName = agent.getFunction().name;
        this.axGenProgram.register(agent as any, childName);
      } catch {
        // Best-effort registration for optimizer/introspection support.
      }
    }

    // Apply examples to compatibility layer if provided
    if (examples && examples.length > 0) {
      this.setExamplesCompat(examples);
    }
  }

  /**
   * @deprecated Use setExamplesCompat() to avoid Ax runtime version coupling.
   */
  setExamples(examples: Readonly<Array<Record<string, any>>>): void {
    this.setExamplesCompat(examples);
  }

  setExamplesCompat(examples: Readonly<Array<Record<string, any>>>): void {
    this.axGenProgram.setExamples(examples as any);

    const baseSetExamples = (AxAgent.prototype as any).setExamples;
    if (typeof baseSetExamples === "function") {
      baseSetExamples.call(this, examples);
      return;
    }

    const internalProgram = (this as any).program;
    if (typeof internalProgram?.setExamples === "function") {
      internalProgram.setExamples(examples as any);
    }
  }

  /**
   * @deprecated Use setDescriptionCompat() to avoid Ax runtime version coupling.
   */
  setDescription(description: string): void {
    this.setDescriptionCompat(description);
  }

  setDescriptionCompat(description: string): void {
    this.agentDefinition = description;
    this.axGenProgram.setDescription(description);

    const baseSetDescription = (AxAgent.prototype as any).setDescription;
    if (typeof baseSetDescription === "function") {
      baseSetDescription.call(this, description);
      return;
    }

    const agentRuntime = this as any;
    if (typeof agentRuntime.program?.setDescription === "function") {
      agentRuntime.program.setDescription(description);
    }
    agentRuntime.actorDescription = description;
    agentRuntime.responderDescription = description;
    if (typeof agentRuntime._buildSplitPrograms === "function") {
      agentRuntime._buildSplitPrograms();
    }
  }

  override getUsage() {
    if (this.executionMode === "axgen") {
      return this.axGenProgram.getUsage();
    }
    return super.getUsage();
  }

  override resetUsage() {
    this.axGenProgram.resetUsage();
    super.resetUsage();
  }

  private resolveInvocationArgs<TOptions>(
    first: Record<string, any> | AxAI,
    second?: Record<string, any> | Readonly<TOptions>,
    third?: Readonly<TOptions>
  ): {
    ai: AxAI;
    values: Record<string, any>;
    options?: Readonly<TOptions>;
    calledWithAI: boolean;
  } {
    const calledWithAI = this.isAxAIService(first);
    const ai = (calledWithAI ? first : this.axai) as AxAI;
    if (!ai) {
      throw new Error(`No AI instance is configured for agent "${this.agentName}"`);
    }

    const values = (calledWithAI ? second : first) as Record<string, any>;
    const options = (calledWithAI ? third : second) as Readonly<TOptions> | undefined;

    return { ai, values, options, calledWithAI };
  }

  /** Merge deferred tool step hooks into forward options */
  private mergeStepHooks(options?: Readonly<AxProgramForwardOptions<any>>): Readonly<AxProgramForwardOptions<any>> | undefined {
    if (!this.deferredToolManager?.isActive) return options;

    const deferredHooks = this.deferredToolManager.getStepHooks();
    const existingHooks = (options as any)?.stepHooks as AxStepHooks | undefined;

    const mergedHooks: AxStepHooks = {
      beforeStep: existingHooks?.beforeStep,
      afterStep: existingHooks?.afterStep,
      afterFunctionExecution: async (ctx) => {
        await existingHooks?.afterFunctionExecution?.(ctx);
        await deferredHooks.afterFunctionExecution?.(ctx);
      },
    };

    return { ...options, stepHooks: mergedHooks } as any;
  }

  private async executeForwardByMode(
    mode: AgentExecutionMode,
    ai: AxAI,
    values: Record<string, any>,
    options?: Readonly<AxProgramForwardOptions<any>>
  ): Promise<Record<string, any>> {
    const opts = this.mergeStepHooks(options);
    if (mode === "axgen") {
      return this.axGenProgram.forward(ai, values, opts as any);
    }
    return super.forward(ai, values, opts as any);
  }

  private recordUsageMetrics(
    labels: { crewId: string; agent: string },
    mode: AgentExecutionMode
  ): void {
    const builtIn =
      mode === "axgen" ? this.axGenProgram.getUsage?.() : super.getUsage?.();
    if (!Array.isArray(builtIn)) return;

    const totals = builtIn.reduce(
      (acc: any, u: any) => {
        const pt = u.tokens?.promptTokens ?? u.promptTokens ?? 0;
        const ct = u.tokens?.completionTokens ?? u.completionTokens ?? 0;
        acc.promptTokens += typeof pt === "number" ? pt : 0;
        acc.completionTokens += typeof ct === "number" ? ct : 0;
        const model =
          u.model ||
          (this.axai as any)?.getLastUsedChatModel?.() ||
          (this.axai as any)?.defaults?.model;
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

  private async runForwardInvocation(
    mode: AgentExecutionMode,
    first: Record<string, any> | AxAI,
    second?: Record<string, any> | Readonly<AxProgramForwardOptions<any>>,
    third?: Readonly<AxProgramForwardOptions<any>>
  ): Promise<Record<string, any>> {
    const { ai, values, options, calledWithAI } = this.resolveInvocationArgs(
      first,
      second,
      third
    );

    const start = performance.now();
    const crewId = (this.crewState as any)?.crewId || this.crewState.get?.("crewId") || "default";
    const labels = { crewId, agent: this.agentName };
    const taskId = `task_${crewId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Track execution context in crew for ACE feedback routing
    const crewInstance = (this.crewState as any)?.crew as AxCrew;
    if (crewInstance) {
      if (calledWithAI) {
        const parentTaskId = (this.crewState as any)?.currentTaskId;
        if (parentTaskId) {
          crewInstance.trackAgentExecution(parentTaskId, this.agentName, values);
        }
      } else {
        crewInstance.trackAgentExecution(taskId, this.agentName, values);
        (this.crewState as any).currentTaskId = taskId;
      }
    }

    if (this.debugEnabled) {
      console.log(`[ACE Debug] forward() called, mode=${mode}, aceConfig=${!!this.aceConfig}`);
    }
    if (this.aceConfig) {
      await this.composeInstructionWithPlaybook();
    }

    const result = await this.executeForwardByMode(mode, ai, values, options);

    const durationMs = performance.now() - start;
    MetricsRegistry.recordRequest(labels, false, durationMs);
    this.recordUsageMetrics(labels, mode);

    if (crewInstance) {
      if (calledWithAI) {
        const parentTaskId = (this.crewState as any)?.currentTaskId;
        if (parentTaskId) {
          crewInstance.recordAgentResult(parentTaskId, this.agentName, result);
        }
      } else {
        crewInstance.recordAgentResult(taskId, this.agentName, result);
        delete (this.crewState as any).currentTaskId;
        (result as any)._taskId = taskId;
      }
    }

    return result;
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
    return this.runForwardInvocation(this.executionMode, first, second, third);
  }

  private runStreamingInvocation(
    mode: AgentExecutionMode,
    first: Record<string, any> | AxAI,
    second?: Record<string, any> | Readonly<AxProgramStreamingForwardOptions<any>>,
    third?: Readonly<AxProgramStreamingForwardOptions<any>>
  ): AxGenStreamingOut<any> {
    const { ai, values, options } = this.resolveInvocationArgs(
      first,
      second,
      third
    );
    const start = performance.now();
    const crewId = (this.crewState as any)?.crewId || this.crewState.get?.("crewId") || "default";
    const labels = { crewId, agent: this.agentName };

    const opts = this.mergeStepHooks(options as any);
    const createStream = () =>
      mode === "axgen"
        ? this.axGenProgram.streamingForward(ai, values, opts as any)
        : super.streamingForward(ai, values, opts as any);

    const wrappedGenerator = (async function* (this: StatefulAxAgent) {
      if (this.aceConfig) {
        await this.composeInstructionWithPlaybook();
      }

      const streamingResult = createStream();
      try {
        for await (const chunk of streamingResult) {
          yield chunk;
        }
      } finally {
        const durationMs = performance.now() - start;
        MetricsRegistry.recordRequest(labels, true, durationMs);
        this.recordUsageMetrics(labels, mode);
      }
    }).bind(this)();

    return wrappedGenerator as AxGenStreamingOut<any>;
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
    return this.runStreamingInvocation(this.executionMode, first, second, third);
  }

  // Legacy cost API removed: rely on Ax trackers for cost reporting
  getLastUsageCost(): UsageCost | null { return null; }

  // Get the accumulated costs for all runs of this agent
  getAccumulatedCosts(): UsageCost | null { return null; }

  // Metrics API for this agent
  getMetrics() {
    const crewId = (this.crewState as any)?.crewId || (this.crewState.get?.('crewId')) || 'default';
    return MetricsRegistry.snapshot({ crewId, agent: this.agentName } as any);
  }

  resetMetrics(): void {
    const crewId = (this.crewState as any)?.crewId || (this.crewState.get?.('crewId')) || 'default';
    MetricsRegistry.reset({ crewId, agent: this.agentName } as any);
  }

  // =============
  // ACE API
  // =============

  async initACE(ace?: ACEConfig): Promise<void> {
    this.aceConfig = ace;
    if (!ace) return;
    try {
      this.aceBaseInstruction =
        this.agentDefinition || this.getSignature().getDescription() || '';

      const { buildACEOptimizer, loadInitialPlaybook, createEmptyPlaybook } = await import('./ace.js');
      this.aceOptimizer = buildACEOptimizer(this.axai, ace);

      if (!ace.compileOnStart) {
        (this.aceOptimizer as any).program = this;
      }

      const initial = await loadInitialPlaybook(ace.persistence);
      this.applyPlaybook(initial ?? createEmptyPlaybook());

      if (this.debugEnabled) {
        console.log(`[ACE Debug] Initialized for ${this.agentName}, base instruction: ${this.aceBaseInstruction?.slice(0, 50)}...`);
      }
    } catch (error) {
      console.warn(`Failed to initialize ACE for agent ${this.agentName}:`, error);
    }
  }

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

      if (result?.artifact?.playbook) {
        await this.applyPlaybook(result.artifact.playbook);
      }
    } catch (error) {
      console.warn(`ACE offline compile failed for ${this.agentName}:`, error);
    }
  }

  async applyOnlineUpdate(params: { example: any; prediction: any; feedback?: string }): Promise<void> {
    if (!this.aceConfig) return;
    if (!params.feedback?.trim()) return;

    try {
      const { persistPlaybook, addFeedbackToPlaybook, createEmptyPlaybook } = await import('./ace.js');

      let playbook = this.acePlaybook ?? (this.aceOptimizer as any)?.playbook;
      if (!playbook) {
        playbook = createEmptyPlaybook();
      }

      if (this.debugEnabled) {
        console.log(`[ACE Debug] Adding feedback to playbook: "${params.feedback}"`);
      }

      const teacherAI = (this.aceOptimizer as any)?.teacherAI;
      const aiForAnalysis = teacherAI ?? this.axai;

      await addFeedbackToPlaybook(playbook, params.feedback, aiForAnalysis, this.debugEnabled);

      this.applyPlaybook(playbook);

      if (this.aceOptimizer) {
        (this.aceOptimizer as any).playbook = playbook;
      }

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

  getPlaybook(): any | undefined {
    return this.acePlaybook;
  }

  applyPlaybook(pb: any): void {
    this.acePlaybook = pb;
    try {
      (this.aceOptimizer as any).playbook = pb;
    } catch {
      // Ignore - optimizer may not be initialized yet
    }
  }

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

      const baseInstruction = this.aceBaseInstruction || '';
      const combinedInstruction = [baseInstruction.trim(), '', rendered]
        .filter((part) => part.trim().length > 0)
        .join('\n\n');

      if (this.debugEnabled) {
        console.log(`[ACE Debug] combinedInstruction (${combinedInstruction.length} chars)`);
      }

      if (combinedInstruction.length >= 20) {
        const program = (this as any).program;
        if (program?.setDescription) {
          program.setDescription(combinedInstruction);
        }
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

export { StatefulAxAgent };
