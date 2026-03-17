---
name: ax-crew-execution-modes
version: "__VERSION__"
description: "ax-crew execution modes: execution mode, axgen, axagent, RLM, runtime, contextFields, AxJSRuntime, contextManagement, fields, shared, globallyShared, excluded, maxTurns, maxSubAgentCalls"
argument-hint: [topic]
allowed-tools: Read, Grep, Glob
---

# ax-crew Execution Modes

## axgen (default)

Uses `AxGen` for structured generation. Single-pass, deterministic. Sub-agents become callable tool functions. Best for straightforward input-to-output tasks.

```typescript
{
  name: "SimpleAgent",
  executionMode: "axgen",  // default, can be omitted
  signature: "query:string -> answer:string",
  // ...
}
```

## axagent

Uses `AxAgent` with RLM (Runtime Language Model). Multi-step agentic reasoning loop. Supports context management, tombstoning, and state inspection.

```typescript
{
  name: "ReasoningAgent",
  executionMode: "axagent",
  signature: "context:string, query:string -> answer:string",
  // ...
  axAgentOptions: {
    contextFields: ["context"],  // required for axagent (can be empty [])
    runtime: new AxJSRuntime({ permissions: [AxJSRuntimePermission.TIMING] }),
  },
}
```

Both modes use the same `forward()` / `streamingForward()` API.

## axAgentOptions Full Reference

Type: `AxCrewAxAgentOptions` (extends `Partial<AxAgentOptions>`)

```typescript
axAgentOptions: {
  // Required: which input fields contain context for RLM processing
  contextFields: string[],

  // Runtime for code execution in RLM
  runtime?: AxJSRuntime,

  // Max reasoning turns before stopping
  maxTurns?: number,

  // Max sub-agent delegations
  maxSubAgentCalls?: number,

  // RLM mode
  mode?: "simple" | "full",

  // Context management strategies
  contextManagement?: {
    errorPruning?: boolean,          // prune context on errors
    hindsightEvaluation?: boolean,   // evaluate context relevance
    pruneRank?: number,              // ranking threshold for pruning
    tombstoning?: {                  // summarize pruned context
      model: string,
      modelConfig?: { maxTokens?: number },
    },
    stateInspection?: {
      contextThreshold?: number,     // token count threshold
    },
  },

  // Sub-agents and functions (can also be set via top-level agents/functions)
  agents?: AxAgentOptions['agents'],
  functions?: AxAgentOptions['functions'],

  // Field sharing between parent and sub-agents
  fields?: {
    shared?: string[],          // fields shared with sub-agents
    globallyShared?: string[],  // fields shared with all descendants
    excluded?: string[],        // opt out of parent's shared fields
  },
}
```

## fields: shared, globallyShared, excluded

Control how input/output fields propagate between parent and sub-agents in `axagent` mode.

```typescript
// Parent agent shares knowledgeBase and userId with sub-agents
{
  name: "CustomerSupportAgent",
  executionMode: "axagent",
  signature: "query:string, knowledgeBase:string, userId:string -> answer:string",
  agents: ["PolicyLookupAgent", "BillingHelperAgent", "SentimentClassifierAgent"],
  axAgentOptions: {
    contextFields: ["knowledgeBase"],
    fields: { shared: ["knowledgeBase", "userId"] },
    runtime,
  },
}

// Sub-agent that opts OUT of receiving shared fields
{
  name: "SentimentClassifierAgent",
  executionMode: "axagent",
  signature: 'question:string -> sentiment:string "positive, negative, or neutral"',
  axAgentOptions: {
    contextFields: [],
    fields: { excluded: ["knowledgeBase", "userId"] },  // won't receive these
    runtime,
  },
}
```

## Canonical Pattern: RLM with Context Management

From `rlm-long-task.ts`:

```typescript
import { AxJSRuntime, AxJSRuntimePermission } from '@ax-llm/ax';
import { AxCrew } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';

const runtime = new AxJSRuntime({
  permissions: [AxJSRuntimePermission.TIMING],
});

const config: AxCrewConfig = {
  crew: [
    {
      name: "Analyzer",
      description: "Analyzes a large dataset with semantic context management.",
      executionMode: "axagent",
      signature:
        'context:string, query:string -> answer:string, keyFindings:string[] "Analyzes context and returns findings"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
      axAgentOptions: {
        contextFields: ["context"],
        runtime,
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
      context: "Region,Month,Product,Units,Revenue\nNorth,Jan,Widget-A,1200,48000\n...",
      query: "Which region has the highest revenue growth from Jan to Mar?",
    });

    console.log("Answer:", result.answer);
    console.log("Key Findings:", result.keyFindings);

    console.log("Agent Metrics:", JSON.stringify(analyzer.getMetrics?.(), null, 2));
    console.log("Crew Metrics:", JSON.stringify(crew.getCrewMetrics(), null, 2));
  } finally {
    crew.destroy();
  }
}

main().catch(console.error);
```

## Canonical Pattern: Shared Fields Between Agents

From `rlm-shared-fields.ts`:

```typescript
import { AxJSRuntime, AxJSRuntimePermission } from '@ax-llm/ax';
import { AxCrew } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';

const runtime = new AxJSRuntime({
  permissions: [AxJSRuntimePermission.TIMING],
});

const config: AxCrewConfig = {
  crew: [
    {
      name: "PolicyLookupAgent",
      description: "Looks up policy details in the provided knowledge base.",
      executionMode: "axagent",
      signature: 'question:string -> answer:string',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
      axAgentOptions: { contextFields: [], runtime },
    },
    {
      name: "SentimentClassifierAgent",
      description: "Classifies customer message sentiment.",
      executionMode: "axagent",
      signature: 'question:string -> sentiment:string "positive, negative, or neutral"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
      axAgentOptions: {
        contextFields: [],
        fields: { excluded: ["knowledgeBase", "userId"] },
        runtime,
      },
    },
    {
      name: "CustomerSupportAgent",
      description: "Routes queries to specialists and returns a final answer.",
      executionMode: "axagent",
      signature: "query:string, knowledgeBase:string, userId:string -> answer:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
      agents: ["PolicyLookupAgent", "SentimentClassifierAgent"],
      axAgentOptions: {
        contextFields: ["knowledgeBase"],
        fields: { shared: ["knowledgeBase", "userId"] },
        runtime,
      },
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  try {
    await crew.addAllAgents();

    const supportAgent = crew.agents?.get("CustomerSupportAgent");
    if (!supportAgent) throw new Error("Failed to initialize");

    const result = await supportAgent.forward({
      query: "I want to return the Smart Lamp. Am I eligible for a full refund?",
      knowledgeBase: "REFUND POLICY: Full refund within 30 days...",
      userId: "cust-42",
    });

    console.log("Answer:", result.answer);
  } finally {
    crew.destroy();
  }
}

main().catch(console.error);
```

## Do Not Generate

- Do NOT use `axAgentOptions` without setting `executionMode: "axagent"` -- it is ignored in `axgen` mode.
- Do NOT omit `contextFields` when using `axagent` mode -- it is required (use `[]` if no context fields).
- Do NOT omit `runtime` when using RLM features -- `AxJSRuntime` is required for code execution.
- Do NOT confuse `fields.shared` with `contextFields` -- `shared` controls field propagation to sub-agents, `contextFields` identifies which fields contain context for RLM processing.
- Do NOT set `fields.excluded` on a parent agent -- it is for sub-agents opting out of the parent's shared fields.
- Do NOT use `axAgentOptions.agents` or `axAgentOptions.functions` unless you need the AxAgent-native format -- prefer the top-level `agents` and `functions` config fields.

## References

- [rlm-long-task.ts example](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/rlm-long-task.ts)
- [rlm-shared-fields.ts example](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/rlm-shared-fields.ts)
- [Source: AxCrewAxAgentOptions type](https://github.com/amitdeshmukh/ax-crew/blob/main/src/types.ts)
- [Source: StatefulAxAgent execution mode handling](https://github.com/amitdeshmukh/ax-crew/blob/main/src/agents/index.ts)
