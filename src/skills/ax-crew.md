---
name: ax-crew
version: 8.7.2
description: "AxCrew - multi-agent orchestration: crew, agents, addAgent, addAllAgents, addAgentsToCrew, forward, streaming, sub-agents"
---

# AxCrew

Multi-agent orchestration built on [ax-llm/ax](https://github.com/ax-llm/ax). Config-driven crew of agents sharing state, functions, and metrics.

## Use These Defaults

```ts
import { AxCrew, AxCrewFunctions } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';
```

Always call `addAllAgents()` or `addAgentsToCrew([...names])` before using agents. Retrieve agents via `crew.agents.get("AgentName")`.

## Canonical Pattern

```ts
import { AxCrew, AxCrewFunctions } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';
import dotenv from 'dotenv';
dotenv.config();

const config: AxCrewConfig = {
  crew: [
    {
      name: "researcher",
      description: "A research agent that finds information",
      signature: "query:string -> research:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash-lite", maxTokens: 4000, stream: true },
      options: { debug: true },
      functions: ["CurrentDateTime"]
    },
    {
      name: "writer",
      description: "A writing agent that creates content",
      signature: "topic:string -> article:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash-lite", maxTokens: 4000, stream: true },
      options: { debug: true },
      agents: ["researcher"] // sub-agent
    }
  ]
};

async function main() {
  const crew = new AxCrew(config, AxCrewFunctions);

  // Add agents (resolves dependency order automatically)
  await crew.addAllAgents();

  const writer = crew.agents?.get("writer");
  if (!writer) throw new Error("Failed to initialize writer");

  try {
    const { article } = await writer.forward({
      topic: "Quantum Computing Benefits",
    });
    console.log("Article:", article);

    // Metrics
    console.log("Writer Metrics:", JSON.stringify(writer.getMetrics?.(), null, 2));
    console.log("Crew Metrics:", JSON.stringify(crew.getCrewMetrics?.(), null, 2));
  } finally {
    crew.destroy();
  }
}

main().catch(console.error);
```

## AxCrew Constructor

```ts
new AxCrew(crewConfig: AxCrewConfig, functionsRegistry?: FunctionRegistryType, options?: AxCrewOptions, crewId?: string)
```

- `crewConfig` -- `{ crew: AgentConfig[] }`. See skill `ax-crew-agent-config`.
- `functionsRegistry` -- map of function name to `AxFunction` or class-based function. See skill `ax-crew-functions`.
- `options` -- `{ debug?: boolean, telemetry?: { tracer?: any, meter?: any } }`.
- `crewId` -- auto-generated UUID if omitted.

## Agent Lifecycle

| Method | Description |
|---|---|
| `await crew.addAllAgents()` | Add all agents from config (resolves dependency order) |
| `await crew.addAgentsToCrew(["A", "B"])` | Add a subset by name |
| `await crew.addAgent("A")` | Add a single agent |
| `crew.addLazyAgent("A")` | Defer expensive init until first use |
| `crew.agents?.get("A")` | Retrieve a `StatefulAxAgent` |
| `await agent.forward({ key: "value" })` | Run the agent |
| `agent.streamingForward({ key: "value" })` | Stream output chunks |
| `crew.state` | Shared `StateInstance` across all agents |
| `crew.resetCosts()` | Reset usage/metrics for all agents |
| `crew.getCrewMetrics()` | Aggregate metrics snapshot |
| `crew.destroy()` | Clean up agents, state, execution history |

## Related Skills

- `ax-crew-agent-config` -- AgentConfig fields, provider setup, executionMode
- `ax-crew-functions` -- Function registry, custom tools, class-based functions
- `ax-crew-state` -- Shared state API, accessing state from functions

## Do Not Generate

- Do NOT instantiate `AxAgent` or `AxGen` directly; use `AxCrew` which wraps them as `StatefulAxAgent`.
- Do NOT call `agent.forward()` before calling `addAllAgents()` or `addAgentsToCrew()`.
- Do NOT import from `@ax-llm/ax` for crew orchestration; import from `@amitdeshmukh/ax-crew`.
- Do NOT use `crew.createAgent()` directly; use `addAgent()` or `addAllAgents()`.
- Do NOT forget to call `crew.destroy()` to clean up resources.

## References

- [basic-researcher-writer.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/basic-researcher-writer.ts)
- [write-post-and-publish-to-wordpress.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/write-post-and-publish-to-wordpress.ts)
- [providerArgs.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/providerArgs.ts)
