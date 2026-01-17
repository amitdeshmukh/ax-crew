# Integrate AxACE into Ax-Crew (per-agent)

### Scope

- Add optional AxACE support to `StatefulAxAgent` so each agent can: (a) run offline compile with examples + metric, (b) apply online updates with feedback, and (c) persist playbooks in memory or to file/DB. Reference: [ACE docs](https://axllm.dev/ace/).
- Add simple execution tracking at crew level for intelligent feedback routing across agent dependency chains.

### Key Design

- **Per-agent playbooks**: stored in-memory, optionally persisted via path or callback.
- **Student/Teacher AIs**: default student = agent's existing `AxAI`; teacher configured per agent (provider + model) or default to student.
- **Non-breaking**: all ACE fields are optional; no behavior changes unless enabled.
- **Execution tracking for feedback routing**: Simple in-memory tracking of agent involvement in task execution, enabling feedback distribution across agent dependency chains.

### Architecture Clarification

**OpenTelemetry Telemetry** (observability) and **ACE Feedback Routing** (execution tracking) are **separate concerns**:

| Feature | Purpose | Where Configured |
|---------|---------|------------------|
| **Telemetry** | Observability, tracing, metrics | `AxAI` options via `AxCrewOptions.telemetry` |
| **Execution Tracking** | Track which agents handled a task for ACE feedback | `AxCrew.executionHistory` in-memory Map |

Telemetry is an `AxAI` feature (not `AxAgent`). The Ax framework automatically creates OpenTelemetry spans for all LLM operations when `tracer`/`meter` are passed to `AxAI`.

### Files to Update/Add

- Update `src/types.ts`: add `ACEConfig` and optional `ace?: ACEConfig` to `AgentConfig`. ✅ Done
- **Add `src/agents/ace.ts`**: helper to build optimizer using real `AxACE` from `@ax-llm/ax`, load/save playbooks, run offline/online flows.
- Update `src/agents/index.ts` (`StatefulAxAgent`): hold `aceConfig`, optional `aceOptimizer`, and methods: `initACE()`, `optimizeOffline(...)`, `applyOnlineUpdate(...)`, `getPlaybook()`, `applyPlaybook(...)`.
- Update `src/agents/index.ts` (`AxCrew`): add `executionHistory` Map for tracking agent involvement, `applyTaskFeedback()` for routing.
- Update `src/agents/agentConfig.ts`: parse `ace` block; optionally load initial playbook and pass into agent. ✅ Telemetry already correctly passed to `AxAI`.
- Add `examples/ace-feedback-routing.ts`: demonstrates execution-based feedback routing across agent dependency chains.

### New Types (in src/types.ts) ✅ Already Implemented

```ts
export interface ACETeacherConfig {
  provider?: Provider;
  providerKeyName?: string;
  apiURL?: string;
  ai?: AxModelConfig & { model: string };
  providerArgs?: Record<string, unknown>;
}

export interface ACEPersistenceConfig {
  playbookPath?: string;
  initialPlaybook?: Record<string, any>;
  autoPersist?: boolean;
  onPersist?: (pb: any) => Promise<void> | void;
  onLoad?: () => Promise<any> | any;
}

export interface ACEOptionsConfig {
  maxEpochs?: number;
  allowDynamicSections?: boolean;
  tokenBudget?: number;
  reflectorPrompt?: string;
  curatorPrompt?: string;
}

export interface ACEMetricConfig {
  metricFnName?: string;
  primaryOutputField?: string;
}

export interface ACEConfig {
  teacher?: ACETeacherConfig;
  persistence?: ACEPersistenceConfig;
  options?: ACEOptionsConfig;
  metric?: ACEMetricConfig;
  compileOnStart?: boolean;
}
```

### Helper Module (src/agents/ace.ts)

```ts
import { AxACE, type AxMetricFn } from "@ax-llm/ax";
import { ai as buildAI } from "@ax-llm/ax";
import type { ACEConfig, ACEPersistenceConfig, ACEMetricConfig, FunctionRegistryType } from "../types.js";
import type { StatefulAxAgent } from "./index.js";

// Build AxACE optimizer with student (agent's AI) and optional teacher
export function buildACEOptimizer(
  studentAI: any,
  cfg: ACEConfig
): AxACE {
  const teacherAI = buildTeacherAI(cfg.teacher, studentAI);
  return new AxACE(
    { studentAI, teacherAI, verbose: cfg.options?.maxEpochs ? true : false },
    {
      maxEpochs: cfg.options?.maxEpochs,
      allowDynamicSections: cfg.options?.allowDynamicSections,
      initialPlaybook: cfg.persistence?.initialPlaybook
    }
  );
}

// Load playbook from file or callback
export async function loadInitialPlaybook(cfg?: ACEPersistenceConfig): Promise<any | undefined> { /*...*/ }

// Persist playbook to file or callback
export async function persistPlaybook(pb: any, cfg?: ACEPersistenceConfig): Promise<void> { /*...*/ }

// Resolve metric function from registry or create equality metric
export function resolveMetric(cfg: ACEMetricConfig | undefined, registry: FunctionRegistryType): AxMetricFn | undefined { /*...*/ }

// Run offline compile
export async function runOfflineCompile(args: {
  program: any;
  optimizer: AxACE;
  metric: AxMetricFn;
  examples: any[];
  persistence?: ACEPersistenceConfig;
}): Promise<any> { /*...*/ }

// Run online update
export async function runOnlineUpdate(args: {
  optimizer: AxACE;
  example: any;
  prediction: any;
  feedback?: string;
  persistence?: ACEPersistenceConfig;
}): Promise<any> { /*...*/ }
```

### Agent Class Changes (minimal API)

```ts
class StatefulAxAgent extends AxAgent<any, any> {
  private aceConfig?: ACEConfig;
  private aceOptimizer?: AxACE;
  private acePlaybook?: any;

  async initACE(ace?: ACEConfig): Promise<void> { /* build optimizer, load playbook */ }
  async optimizeOffline(params?: { metric?: AxMetricFn; examples?: any[] }): Promise<void> { /* compile, persist */ }
  async applyOnlineUpdate(params: { example: any; prediction: any; feedback?: string }): Promise<void> { /* update + persist */ }
  getPlaybook(): any | undefined { return this.acePlaybook; }
  applyPlaybook(pb: any): void { /* apply to optimizer */ }
}
```

**Note**: No telemetry fields in agent - telemetry is handled by `AxAI`.

### Crew-Level Execution Tracking for Feedback Routing

**Problem Solved**: "How does the crew know which agent to pass online feedback to?"

**Solution**: Simple in-memory execution history (not OpenTelemetry - that's for observability):

```ts
class AxCrew {
  // Track agent execution for ACE feedback routing
  private executionHistory: Map<string, {
    taskId: string;
    rootAgent: string;
    involvedAgents: Set<string>;
    taskInput: any;
    results: Map<string, any>;
    startTime: number;
    endTime?: number;
  }> = new Map();

  // Track agent involvement during execution
  trackAgentExecution(taskId: string, agentName: string, input: any): void { /*...*/ }
  recordAgentResult(taskId: string, agentName: string, result: any): void { /*...*/ }

  // Get involvement info for feedback routing
  getTaskAgentInvolvement(taskId: string): AgentInvolvement | null { /*...*/ }

  // Route feedback to involved agents
  async applyTaskFeedback(params: {
    taskId: string;
    feedback: string;
    strategy?: 'all' | 'primary' | 'weighted';
  }): Promise<void> { /*...*/ }

  // Cleanup old entries
  cleanupOldExecutions(maxAgeMs?: number): void { /*...*/ }
}
```

### Agent Config Parsing

In `parseAgentConfig(...)`:
- Telemetry (`tracer`, `meter`) is passed to `AxAI` options ✅ Already implemented
- If `agentConfigData.ace` is present, the agent's `initACE()` is called during creation
- If `compileOnStart` and a usable metric is available, run offline compile with `examples`

### Minimal Usage

```ts
const config: AxCrewConfig = {
  crew: [
    {
      name: "writer",
      description: "Writes articles",
      signature: "topic:string -> article:string",
      provider: "openai",
      providerKeyName: "OPENAI_API_KEY",
      ai: { model: "gpt-4o-mini" },
      ace: {
        enabled: true,
        teacher: { provider: "openai", providerKeyName: "OPENAI_API_KEY", ai: { model: "gpt-4o" } },
        options: { maxEpochs: 1, allowDynamicSections: true },
        persistence: { playbookPath: "playbooks/writer.json", autoPersist: true },
        metric: { primaryOutputField: "article" },
        compileOnStart: false,
      },
    },
  ],
};

// Initialize crew (telemetry is for observability, separate from ACE)
const crew = new AxCrew(config, AxCrewFunctions, {
  telemetry: { tracer, meter }  // Optional: for OpenTelemetry observability
});

await crew.addAgentsToCrew(["writer"]);
const writer = crew.agents?.get("writer");

// Manual per-agent ACE operations
await writer?.optimizeOffline();
const prediction = await writer?.forward({ topic: "Quantum" });
await writer?.applyOnlineUpdate({ 
  example: { topic: "Quantum" }, 
  prediction, 
  feedback: "Too verbose." 
});

// Crew-level feedback routing (for multi-agent tasks)
// The forward() call returns a taskId that can be used for feedback
const result = await writer.forward({ topic: "AI Ethics" });
await crew.applyTaskFeedback({
  taskId: result._taskId,  // Returned by forward()
  feedback: "More balanced perspective needed",
  strategy: "all"  // Route to all involved agents
});
```

### Benefits

- **Separation of Concerns**: Telemetry (observability) vs Execution Tracking (ACE feedback)
- **Zero Breaking Changes**: All ACE features are opt-in
- **Uses Real AxACE**: Imports actual `AxACE` class from `@ax-llm/ax`
- **Simple Feedback Routing**: In-memory tracking without OpenTelemetry dependency
- **Flexible**: Supports per-agent and crew-level feedback

### Notes

- Persistence is optional; in-memory playbooks work fine. Save to file/DB only if you want reuse after restarts.
- Metric configuration is required for offline compile; online updates don't need a metric.
- Defaults are conservative: ACE is only active when `ace` config is present.
- Telemetry and ACE are independent features - you can use one without the other.
