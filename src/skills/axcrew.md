---
name: axcrew
version: 8.7.3
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
| `crew.crewState` | Shared `StateInstance` across all agents |
| `crew.resetCosts()` | Reset usage/metrics for all agents |
| `crew.getCrewMetrics()` | Aggregate metrics snapshot |
| `crew.destroy()` | Clean up agents, state, execution history |

## Deferred Tool Loading

Agents with many MCP tools can use `deferredTools` in their agent config to avoid overwhelming the LLM context. When the total tool count exceeds a threshold (default 20), only core tools plus a `search_tools` meta-tool are visible to the agent. The LLM discovers additional tools by calling `search_tools`, which uses local multi-signal search (no API calls). Discovered tools persist across `forward()` calls, and related tools are proactively activated alongside the requested tool.

```ts
{
  name: "BigToolAgent",
  // ...
  mcpServers: { /* ... */ },
  deferredTools: { maxTools: 20 },  // optional, 20 is the default threshold
}
```

## Related Skills

- `ax-crew-agent-config` -- AgentConfig fields, provider setup, executionMode
- `ax-crew-functions` -- Function registry, custom tools, class-based functions
- `ax-crew-state` -- Shared state API, accessing state from functions

## Supporting files
- See [examples/basic-researcher-writer.ts](examples/basic-researcher-writer.ts) for a complete runnable example.

## Do Not Generate

- Do NOT instantiate `AxAgent` or `AxGen` directly; use `AxCrew` which wraps them as `StatefulAxAgent`.
- Do NOT call `agent.forward()` before calling `addAllAgents()` or `addAgentsToCrew()`.
- Do NOT import from `@ax-llm/ax` for crew orchestration; import from `@amitdeshmukh/ax-crew`.
- Do NOT use `crew.createAgent()` directly; use `addAgent()` or `addAllAgents()`.
- Do NOT forget to call `crew.destroy()` to clean up resources.

## References

- [basic-researcher-writer.ts](examples/basic-researcher-writer.ts)
- [write-post-and-publish-to-wordpress.ts](examples/write-post-and-publish-to-wordpress.ts)
- [providerArgs.ts](examples/providerArgs.ts)
