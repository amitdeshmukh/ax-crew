---
name: ax-crew-sub-agents
description: AxCrew sub-agent composition via agents[] field. Covers agent delegation, dependency resolution, lazy agents (addLazyAgent), parent-child tool integration, and multi-agent orchestration patterns.
version: "__VERSION__"
---

# AxCrew Sub-Agents

## Core Concept

The `agents[]` field in `AgentConfig` lists names of other agents that become available as tools to the parent agent. AxCrew resolves dependencies and initializes sub-agents before their parent.

## agents[] Field

```typescript
{
  name: "ParentAgent",
  description: "Orchestrates sub-agents",
  signature: "query:string -> answer:string",
  provider: "openai",
  ai: { model: "gpt-4o" },
  agents: ["SubAgentA", "SubAgentB"], // these become callable tools
}
```

The parent agent can call sub-agents as tools automatically. Each sub-agent's signature inputs become the tool's parameters, and its outputs are returned.

## Simple Delegation (Researcher-Writer)

```typescript
import { AxCrew } from 'ax-crew';
import type { AxCrewConfig } from 'ax-crew';

const config: AxCrewConfig = {
  crew: [
    {
      name: "researcher",
      description: "A research agent that finds information",
      signature: "query:string -> research:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash-lite", maxTokens: 4000 },
    },
    {
      name: "writer",
      description: "A writing agent that creates content",
      signature: "topic:string -> article:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash-lite", maxTokens: 4000 },
      agents: ["researcher"], // writer delegates research to researcher
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  // addAllAgents resolves dependency order automatically
  await crew.addAllAgents();

  const writer = crew.agents?.get("writer");
  const { article } = await writer!.forward({
    topic: "Quantum Computing Benefits",
  });
  console.log(article);
  crew.destroy();
}

main().catch(console.error);
```

## Multi-Agent Orchestration (Customer Support)

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
      name: "PolicyLookupAgent",
      description: "Looks up policy details in the provided knowledge base.",
      executionMode: "axagent",
      signature:
        'question:string -> answer:string "Looks up company policies and returns a concise answer"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
      axAgentOptions: { contextFields: [], runtime },
    },
    {
      name: "BillingHelperAgent",
      description: "Answers billing and account questions.",
      executionMode: "axagent",
      signature:
        'question:string -> answer:string "Resolves billing and account questions"',
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
      agents: [
        "PolicyLookupAgent",
        "BillingHelperAgent",
        "SentimentClassifierAgent",
      ],
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
  await crew.addAllAgents();

  const support = crew.agents?.get("CustomerSupportAgent");
  const result = await support!.forward({
    query: "What is your refund policy?",
    knowledgeBase: "Full refund within 30 days...",
    userId: "cust-42",
  });
  console.log(result.answer);
  crew.destroy();
}

main().catch(console.error);
```

## Dependency Resolution

`addAllAgents()` and `addAgentsToCrew()` resolve dependencies automatically:

```typescript
// All agents initialized in dependency order
await crew.addAllAgents();

// Or add specific agents -- dependencies must be included or already added
await crew.addAgentsToCrew(["researcher"]); // add leaf first
await crew.addAgentsToCrew(["writer"]);     // then parent
```

Dependencies are checked: if agent A lists agent B in `agents[]`, B must be initialized first. `addAllAgents()` handles this automatically via topological ordering.

## Lazy Agents (addLazyAgent)

Defers expensive initialization (MCP servers, AI client) until the agent is first called. Useful for sub-agents that may not be needed on every request.

```typescript
const crew = new AxCrew(config);

// Eager: initialize immediately
await crew.addAgentsToCrew(["MainAgent"]);

// Lazy: tool schema is registered immediately, but actual agent
// initialization (MCP server startup, etc.) is deferred until first call
crew.addLazyAgent("RarelyUsedAgent");
```

The lazy agent exposes the same `getFunction()` interface. When the parent agent delegates to it, the real agent is created on-demand.

## Do Not Generate

- Do NOT list an agent in `agents[]` that is not defined in the crew config
- Do NOT manually wire sub-agent tool calls -- AxCrew does this automatically from the `agents[]` field
- Do NOT assume sub-agents share parent state by default -- use `axAgentOptions.fields.shared` for shared fields
- Do NOT add sub-agents after their parent without using `addAllAgents()` or correct ordering in `addAgentsToCrew()`
- Do NOT use `addLazyAgent()` for agents that are always needed -- it adds latency on first call

## References

- [basic-researcher-writer.ts](../examples/basic-researcher-writer.ts) -- simple delegation
- [rlm-shared-fields.ts](../examples/rlm-shared-fields.ts) -- multi-agent with shared fields
