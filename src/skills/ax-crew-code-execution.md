---
name: ax-crew-code-execution
description: AxCrew code execution with AxJSRuntime for sandboxed JavaScript execution. Covers AxJSRuntime setup, permissions, executionMode axagent, RLM mode, and runtime configuration for autonomous code generation and execution.
version: "__VERSION__"
---

# AxCrew Code Execution

AxJSRuntime from `@ax-llm/ax` provides sandboxed JavaScript execution for agents in RLM (Reasoning Language Model) mode. The agent generates and runs code autonomously to solve tasks.

## Setup

```typescript
import { AxJSRuntime, AxJSRuntimePermission } from '@ax-llm/ax';
import { AxCrew } from 'ax-crew';
import type { AxCrewConfig } from 'ax-crew';

const runtime = new AxJSRuntime({
  permissions: [AxJSRuntimePermission.TIMING],
});

const config: AxCrewConfig = {
  crew: [
    {
      name: "Analyzer",
      description: "Analyzes data with code execution capabilities.",
      executionMode: "axagent", // REQUIRED for runtime
      signature:
        'context:string, query:string -> answer:string, keyFindings:string[] "Analyzes context and returns findings"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
      axAgentOptions: {
        contextFields: ["context"], // fields managed as RLM context
        runtime, // AxJSRuntime instance
        maxTurns: 20,
        maxSubAgentCalls: 40,
        mode: "simple",
        contextManagement: {
          errorPruning: true,
          hindsightEvaluation: true,
          pruneRank: 2,
          tombstoning: {
            model: "gemini-2.5-flash",
            modelConfig: { maxTokens: 60 },
          },
          stateInspection: { contextThreshold: 3000 },
        },
      },
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  try {
    await crew.addAllAgents();

    const analyzer = crew.agents?.get("Analyzer");
    if (!analyzer) throw new Error("Failed to initialize Analyzer");

    const result = await analyzer.forward({
      context: "Region,Month,Revenue\nNorth,Jan,48000\nNorth,Feb,54000\nSouth,Jan,39200",
      query: "Which region has the highest total revenue?",
    });

    console.log(result.answer);
    console.log(result.keyFindings);
  } finally {
    crew.destroy();
  }
}

main().catch(console.error);
```

## Key Requirements

1. **`executionMode: "axagent"`** -- required for runtime support. The default `"axgen"` mode does not support code execution.
2. **`axAgentOptions.runtime`** -- pass an `AxJSRuntime` instance.
3. **`axAgentOptions.contextFields`** -- array of input field names managed as RLM context (can be empty `[]`).

## Shared Runtime Across Agents

A single `AxJSRuntime` instance can be shared across multiple agents:

```typescript
const runtime = new AxJSRuntime({
  permissions: [AxJSRuntimePermission.TIMING],
});

const config: AxCrewConfig = {
  crew: [
    {
      name: "PolicyLookup",
      description: "Looks up policies",
      executionMode: "axagent",
      signature: "question:string -> answer:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
      axAgentOptions: { contextFields: [], runtime },
    },
    {
      name: "BillingHelper",
      description: "Handles billing queries",
      executionMode: "axagent",
      signature: "question:string -> answer:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
      axAgentOptions: { contextFields: [], runtime },
    },
  ],
};
```

## AxJSRuntimePermission

Controls what the sandboxed code can access:

```typescript
import { AxJSRuntimePermission } from '@ax-llm/ax';

const runtime = new AxJSRuntime({
  permissions: [
    AxJSRuntimePermission.TIMING, // access to Date, performance.now()
  ],
});
```

## Minimal RLM Agent (No Context Management)

```typescript
const config: AxCrewConfig = {
  crew: [
    {
      name: "Coder",
      description: "Executes JavaScript code to solve tasks",
      executionMode: "axagent",
      signature: "task:string -> result:string",
      provider: "openai",
      ai: { model: "gpt-4o", temperature: 0 },
      axAgentOptions: {
        contextFields: [],
        runtime: new AxJSRuntime({
          permissions: [AxJSRuntimePermission.TIMING],
        }),
      },
    },
  ],
};
```

## Do Not Generate

- Do NOT use `executionMode: "axgen"` with `runtime` -- code execution requires `"axagent"` mode
- Do NOT use Google's `codeExecution` tool option -- use `AxJSRuntime` instead for sandboxed execution
- Do NOT omit `contextFields` in `axAgentOptions` when using `executionMode: "axagent"` -- it is mandatory (use `[]` if no context fields)
- Do NOT create a new `AxJSRuntime` per request -- reuse a single instance across agents and calls
- Do NOT confuse `axAgentOptions.runtime` with Node.js runtime -- it is a sandboxed JS execution environment

## References

- [rlm-long-task.ts](../examples/rlm-long-task.ts) -- full RLM agent with context management
- [rlm-shared-fields.ts](../examples/rlm-shared-fields.ts) -- shared runtime across sub-agents
