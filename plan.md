# Integrate AxACE into Ax-Crew (per-agent)

### Scope

- Add optional AxACE support to `StatefulAxAgent` so each agent can: (a) run offline compile with examples + metric, (b) apply online updates with feedback, and (c) persist playbooks in memory or to file/DB. Reference: [ACE docs](https://axllm.dev/ace/).

### Key Design

- **Per-agent playbooks**: stored in-memory, optionally persisted via path or callback.
- **Student/Teacher AIs**: default student = agent’s existing `AxAI`; teacher configured per agent (provider + model) or default to student.
- **Non-breaking**: all ACE fields are optional; no behavior changes unless enabled.

### Files to Update/Add

- Update `src/types.ts`: add `ACEConfig` and optional `ace?: ACEConfig` to `AgentConfig`.
- Add `src/agents/ace.ts`: helper to build optimizer, load/save playbooks, run offline/online flows.
- Update `src/agents/index.ts` (`StatefulAxAgent`): hold `aceConfig`, optional `aceOptimizer`, and small methods: `initACE()`, `optimizeOffline(...)`, `applyOnlineUpdate(...)`, `getPlaybook()`, `applyPlaybook(...)`.
- Update `src/agents/agentConfig.ts`: parse `ace` block; optionally load initial playbook and pass into agent; (no compile by default unless `compileOnStart`).
- Add `examples/ace-offline-online.ts`: showcases offline compile + online update using existing agent config.

### New Types (concise)

```ts
// In src/types.ts
export interface ACETeacherConfig {
  provider?: Provider;                // e.g. "openai"
  providerKeyName?: string;           // env var name
  apiURL?: string;                    // optional
  ai?: AxModelConfig & { model: string }; // teacher model
  providerArgs?: Record<string, unknown>;
}

export interface ACEPersistenceConfig {
  playbookPath?: string;              // Node-only convenience
  initialPlaybook?: Record<string, any>;
  autoPersist?: boolean;              // save after updates
  onPersist?: (pb: any) => Promise<void> | void; // DB/KV hook
  onLoad?: () => Promise<any> | any;  // DB/KV hook
}

export interface ACEOptionsConfig {
  maxEpochs?: number;
  allowDynamicSections?: boolean;
  tokenBudget?: number;               // curator hint
  reflectorPrompt?: string;           // optional override
  curatorPrompt?: string;             // optional override
}

export interface ACEMetricConfig {
  metricFnName?: string;              // resolve from registry
  primaryOutputField?: string;        // helper for equality metric
}

export interface ACEConfig {
  enabled?: boolean;
  teacher?: ACETeacherConfig;         // defaults to student
  persistence?: ACEPersistenceConfig;
  options?: ACEOptionsConfig;
  metric?: ACEMetricConfig;
  compileOnStart?: boolean;           // offline compile at startup
}

declare module './types' { // augment AgentConfig
  interface AgentConfig { ace?: ACEConfig }
}
```

### Helper Module

```ts
// src/agents/ace.ts (new)
import { AxACE, AxAI, type AxMetricFn } from "@ax-llm/ax";

export function buildACEOptimizer(agent: StatefulAxAgent, cfg: ACEConfig): AxACE { /*...*/ }
export async function loadInitialPlaybook(cfg: ACEPersistenceConfig): Promise<any|undefined> { /*...*/ }
export async function persistPlaybook(pb: any, cfg: ACEPersistenceConfig): Promise<void> { /*...*/ }
export function resolveMetric(cfg: ACEMetricConfig, registry: FunctionRegistryType): AxMetricFn { /*...*/ }
export async function runOfflineCompile(args: { agent: StatefulAxAgent; optimizer: AxACE; metric: AxMetricFn; examples: any[]; persistence?: ACEPersistenceConfig; }): Promise<void> { /*...*/ }
export async function runOnlineUpdate(args: { agent: StatefulAxAgent; optimizer: AxACE; example: any; prediction: any; feedback?: string; persistence?: ACEPersistenceConfig; tokenBudget?: number; }): Promise<void> { /*...*/ }
```

### Agent Class Changes (minimal API)

- Add optional fields and methods:
```ts
class StatefulAxAgent extends AxAgent<any, any> {
  private aceConfig?: ACEConfig;
  private aceOptimizer?: AxACE;
  async initACE(ace?: ACEConfig): Promise<void> { /* build optimizer, load playbook, apply */ }
  async optimizeOffline(params?: { metric?: AxMetricFn; examples?: any[] }): Promise<void> { /* compile, apply, persist */ }
  async applyOnlineUpdate(params: { example: any; prediction: any; feedback?: string }): Promise<void> { /* update + persist */ }
  getPlaybook(): any | undefined { /*...*/ }
  applyPlaybook(pb: any): void { /* result.optimizedProgram?.applyTo(this) */ }
}
```


### Agent Config Parsing

- In `parseAgentConfig(...)`:
  - If `agentConfigData.ace?.enabled`, pass `ace` to the agent instance; if `compileOnStart` and a usable metric is available, run offline compile once with `examples`.
  - If `persistence.initialPlaybook` or `persistence.playbookPath` present, load and apply on start.

### Minimal Usage

```ts
const config: AxCrewConfig = {
  crew: [
    {
      name: "writer",
      // ... existing fields
      ace: {
        enabled: true,
        teacher: { provider: "openai", providerKeyName: "OPENAI_API_KEY", ai: { model: "gpt-4o" } },
        options: { maxEpochs: 1, allowDynamicSections: true },
        persistence: { playbookPath: "playbooks/writer.json", autoPersist: true },
        metric: { metricFnName: "writerMetric", primaryOutputField: "article" },
        compileOnStart: false,
      },
    },
  ],
};

// Later in code
await crew.addAgentsToCrew(["writer"]);
const writer = crew.agents?.get("writer");
await writer?.optimizeOffline(); // if metric resolved
const prediction = await writer?.forward({ topic: "Quantum" });
await writer?.applyOnlineUpdate({ example: { topic: "Quantum" }, prediction, feedback: "Too verbose." });
```

### Notes

- Persistence is optional; in-memory playbooks are fine. Save to file/DB only if you want reuse after restarts.
- Metric configuration is required for offline compile; online updates don’t need a metric.
- Defaults are conservative: ACE disabled unless explicitly enabled.

### Crew-Level Feedback Coordination

- Add `AxCrew.applyTaskFeedback()` method that routes feedback to appropriate agents
- Track agent involvement in task execution chains
- Support different feedback distribution strategies (primary, all, weighted)
- Maintain backward compatibility with direct agent `applyOnlineUpdate()` calls