---
name: ax-crew
description: Guide for building multi-agent AI systems with ax-crew. Use when creating agent crews, configuring agents, using MCP servers, shared state, sub-agents, streaming, ACE learning, function registries, metrics/cost tracking, telemetry, or agent workflows with @amitdeshmukh/ax-crew.
argument-hint: [topic]
allowed-tools: Read, Grep, Glob
---

# ax-crew Library Guide

ax-crew (`@amitdeshmukh/ax-crew`) is a TypeScript framework for building teams of AI agents with shared state, tools, streaming, MCP integration, and built-in metrics/cost tracking. It is powered by [AxLLM](https://axllm.dev) (`@ax-llm/ax`).

**Package:** `@amitdeshmukh/ax-crew` (v8.5.0+)
**Peer deps:** `@ax-llm/ax`, `@ax-llm/ax-tools`, `@opentelemetry/api` (optional)
**Node.js:** >= 21

## Installation

```bash
npm install @amitdeshmukh/ax-crew @ax-llm/ax @ax-llm/ax-tools
```

## Core Concepts

- **Config-first:** Define agents in a JSON/TypeScript config object, instantiate on demand.
- **Shared state:** Simple key/value store all agents can read/write via `crew.state`.
- **Sub-agents:** Agents can delegate to other agents listed in their `agents` field.
- **Functions (tools):** Register callable tools via a function registry, reference by name.
- **Execution modes:** `axgen` (default, structured generation) or `axagent` (agentic loop with RLM).
- **MCP:** Connect agents to external MCP servers (STDIO, HTTP SSE, Streamable HTTP).
- **ACE:** Agentic Context Engineering - agents learn from human feedback at runtime.
- **Metrics:** Per-agent and crew-level token usage, cost estimation, and request stats.

## Quick Start

```typescript
import { AxCrew, AxCrewFunctions } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';

const config: AxCrewConfig = {
  crew: [
    {
      name: "Researcher",
      description: "Finds information on a topic",
      signature: 'query:string "research query" -> research:string "research findings"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
      functions: ["CurrentDateTime"]
    },
    {
      name: "Writer",
      description: "Writes articles based on research",
      signature: 'topic:string -> article:string',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0.7 },
      agents: ["Researcher"]  // Writer can delegate to Researcher
    }
  ]
};

const crew = new AxCrew(config, AxCrewFunctions);
await crew.addAllAgents();

const writer = crew.agents?.get("Writer");
const { article } = await writer.forward({ topic: "Quantum Computing" });
console.log(article);

// Metrics
console.log(crew.getCrewMetrics());

// Cleanup
crew.destroy();
```

## Agent Configuration Reference

Each agent in the `crew` array accepts these fields:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique agent name |
| `description` | string | Yes | What the agent does |
| `signature` | string | Yes | DSPy-format I/O schema: `input:type "desc" -> output:type "desc"` |
| `provider` | string | Yes | LLM provider: `google-gemini`, `anthropic`, `openai`, `azure-openai`, etc. |
| `providerKeyName` | string | No | Env var name for API key (e.g. `"GEMINI_API_KEY"`) |
| `ai` | object | Yes | `{ model: string, temperature?: number, maxTokens?: number, stream?: boolean }` |
| `executionMode` | string | No | `"axgen"` (default) or `"axagent"` |
| `definition` / `prompt` | string | No | System prompt (>= 100 chars). `definition` takes precedence. |
| `functions` | string[] | No | Tool names from the function registry |
| `agents` | string[] | No | Sub-agent names this agent can delegate to |
| `examples` | object[] | No | Few-shot examples matching the signature |
| `mcpServers` | object | No | MCP server configurations |
| `ace` | object | No | ACE learning configuration |
| `debug` | boolean | No | Enable debug logging |
| `apiURL` | string | No | Custom API endpoint (e.g. for Ollama) |
| `providerArgs` | object | No | Provider-specific args (e.g. Azure deployment details) |
| `options` | object | No | Forward options: `debug`, `stream`, `codeExecution`, `thinkingTokenBudget`, etc. |
| `axAgentOptions` | object | No | RLM options (only for `axagent` mode): `runtime`, `contextFields`, `mode`, `maxTurns` |

### Signature Format (DSPy)

```
"inputField:type \"description\" -> outputField:type \"description\""
```

Supported types: `string`, `number`, `boolean`, `json`, `string[]`, etc.

Examples:
```
"query:string -> answer:string"
"task:string \"a task\" -> plan:string \"step-by-step plan\""
"question:string, context:string? -> answer:string, confidence:number"
```

## Adding Agents to the Crew

Three methods, from simplest to most controlled:

```typescript
// 1. All agents (auto-handles dependencies)
await crew.addAllAgents();

// 2. Subset with auto dependency resolution
await crew.addAgentsToCrew(["Writer", "Researcher"]);

// 3. Manual (you handle dependency order)
await crew.addAgent("Researcher");
await crew.addAgent("Writer");

// 4. Lazy initialization (defers expensive init until delegation)
await crew.addLazyAgent("ExpensiveSubAgent");
```

`addLazyAgent()` builds the agent schema immediately (so parent agents can see it as a tool) but defers expensive initialization (MCP server startup, AI client creation) until the agent is actually called.

## Function Registry (Tools)

Two ways to define tools:

### Direct AxFunction objects

```typescript
import type { AxFunction } from '@ax-llm/ax';

const myFunctions = {
  SearchWeb: {
    name: 'SearchWeb',
    description: 'Searches the web',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'search query' } }
    },
    func: async ({ query }) => { /* ... */ return results; }
  }
};
```

### Class-based (receives shared state)

```typescript
class DatabaseQuery {
  constructor(private state: Record<string, any>) {}
  toFunction(): AxFunction {
    return {
      name: 'DatabaseQuery',
      description: 'Queries the database',
      parameters: {
        type: 'object',
        properties: { sql: { type: 'string', description: 'SQL query' } }
      },
      func: async ({ sql }) => {
        const userId = this.state.userId; // Access shared state
        return await db.query(sql, userId);
      }
    };
  }
}

const crew = new AxCrew(config, { DatabaseQuery, ...AxCrewFunctions });
```

Built-in functions: `CurrentDateTime`, `DaysBetweenDates` (via `AxCrewFunctions`).

## Shared State

```typescript
crew.state.set('userId', '123');
crew.state.get('userId');       // '123'
crew.state.getAll();            // { userId: '123' }
crew.state.reset();             // Clear all

// Agents share the same state
const agent = crew.agents?.get("MyAgent");
agent.state.set('key', 'value');  // Visible to all agents
```

## Streaming

```typescript
// Method 1: streamingForward (async iterator)
const stream = await agent.streamingForward({ topic: "AI" });
for await (const chunk of stream) {
  if (chunk.delta && 'answer' in chunk.delta) {
    process.stdout.write(chunk.delta.answer);
  }
}

// Method 2: forward with onStream callback
await agent.forward(
  { topic: "AI" },
  { onStream: (chunk) => process.stdout.write(chunk) }
);
```

## MCP Server Integration

Three transport types, auto-detected by config shape:

```typescript
mcpServers: {
  // STDIO - local process
  "filesystem": {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
    env: { NODE_ENV: "production" }
  },
  // HTTP SSE - remote server
  "api-server": {
    sseUrl: "https://api.example.com/mcp/sse"
  },
  // Streamable HTTP - bidirectional
  "stream-service": {
    mcpEndpoint: "http://localhost:3002/stream",
    options: { timeout: 30000 }
  }
}
```

### MCP Tool Filtering

Reduce token usage by exposing only needed tools:

```typescript
mcpServers: {
  graphjin: {
    mcpEndpoint: "http://localhost:8080/api/v1/mcp",
    tools: ["list_workflows", "execute_workflow", "describe_table"]  // Only these tools
  }
}
```

## ACE (Agentic Context Engineering)

Enable agents to learn from human feedback at runtime:

```typescript
{
  name: "SupportAgent",
  // ... other config ...
  ace: {
    teacher: {
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-flash-latest" }
    },
    options: { maxEpochs: 1, allowDynamicSections: true },
    persistence: {
      playbookPath: "playbooks/support.json",
      autoPersist: true
    },
    metric: { primaryOutputField: "response" },
    compileOnStart: false
  }
}
```

### Applying Feedback

```typescript
const result = await agent.forward({ ticket: "..." });

// Teach the agent
await crew.applyTaskFeedback({
  taskId: result._taskId,
  feedback: "For loyal customers, extend return window to 60 days",
  strategy: "all"  // "all" | "primary" | "weighted"
});

// View learned rules
const playbook = agent.getPlaybook?.();
```

## Metrics & Cost Tracking

```typescript
// Per-agent metrics
const metrics = agent.getMetrics?.();
// { provider, model, requests: {...}, tokens: {...}, estimatedCostUSD, functions: {...} }

// Crew-level aggregated metrics
const crewMetrics = crew.getCrewMetrics();

// Reset
crew.resetCosts();
crew.resetMetrics();
```

## OpenTelemetry Integration

```typescript
import { trace, metrics } from '@opentelemetry/api';

const crew = new AxCrew(config, functions, undefined, {
  telemetry: {
    tracer: trace.getTracer('my-app'),
    meter: metrics.getMeter('my-app')
  }
});
```

## Execution Modes

### axgen (default)
Structured generation via AxGen. Sub-agents become callable tool functions. Best for deterministic, single-pass tasks.

### axagent
Agentic loop with RLM (Runtime Language Model) support. Best for multi-step reasoning.

```typescript
import { AxJSRuntime, AxJSRuntimePermission } from '@ax-llm/ax';

{
  name: "DeepResearcher",
  executionMode: "axagent",
  signature: "query:string, context:string? -> answer:string",
  // ... provider config ...
  axAgentOptions: {
    runtime: new AxJSRuntime({ permissions: [AxJSRuntimePermission.TIMING] }),
    contextFields: ["context"],
    mode: "simple",
    maxTurns: 12
  }
}
```

Both modes use the same `forward()` / `streamingForward()` API.

## Environment Setup

Set provider API keys as env vars. Each agent specifies which key via `providerKeyName`:

```bash
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

AxCrew resolves keys via `process.env[providerKeyName]` (Node) or `globalThis[providerKeyName]` (browser).

## Cleanup

Always call `crew.destroy()` when done to clean up MCP servers and resources:

```typescript
try {
  // ... use agents ...
} finally {
  crew.destroy();
}
```

## Key Exports

```typescript
import {
  AxCrew,              // Main class
  AxCrewFunctions,     // Built-in function registry
  MetricsRegistry,     // Metrics helpers
} from '@amitdeshmukh/ax-crew';

import type {
  AxCrewConfig,        // Top-level config
  AgentConfig,         // Per-agent config
  AxCrewOptions,       // Constructor options (telemetry, debug)
  StateInstance,        // State API
  FunctionRegistryType,// Function registry shape
  ACEConfig,           // ACE configuration
} from '@amitdeshmukh/ax-crew';
```

## Common Patterns

### Manager + Specialist Pattern

```typescript
const config: AxCrewConfig = {
  crew: [
    {
      name: "SpecialistAgent",
      description: "Handles domain-specific queries",
      signature: 'query:string -> answer:string',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-pro", temperature: 0 },
      mcpServers: { /* domain tools */ }
    },
    {
      name: "ManagerAgent",
      description: "Orchestrates specialists to answer questions",
      prompt: "You orchestrate sub-agents to answer user questions. Delegate domain queries to specialists.",
      signature: 'question:string -> answer:string',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-pro", temperature: 0 },
      agents: ["SpecialistAgent"]
    }
  ]
};
```

### Lazy Sub-Agent for Expensive Resources

```typescript
const crew = new AxCrew(config);
await crew.addLazyAgent("HeavyMCPAgent");   // Schema only, no MCP startup yet
await crew.addAgentsToCrew(["ManagerAgent"]); // Manager sees HeavyMCPAgent as a tool
// HeavyMCPAgent initializes only when Manager actually delegates to it
```

### Pipeline Pattern (Sequential Processing)

```typescript
const crew = new AxCrew(config);
await crew.addAllAgents();

const researcher = crew.agents?.get("Researcher");
const writer = crew.agents?.get("Writer");

const { research } = await researcher.forward({ query: "topic" });
crew.state.set("research", research);
const { article } = await writer.forward({ topic: "topic" });
```

## Examples

See the `examples/` directory for complete working examples:

- `basic-researcher-writer.ts` - Simple two-agent crew
- `mcp-agent.ts` - MCP server integration with sub-agents
- `streaming.ts` - Real-time token streaming
- `run-crew-workflow.ts` - Database workflows with MCP tool filtering
- `ace-customer-support.ts` - ACE learning from feedback
- `ace-flight-finder.ts` - Flight assistant with preference learning
- `rlm-long-task.ts` - RLM mode with context management
- `rlm-shared-fields.ts` - RLM with field propagation
- `telemetry-demo.ts` - OpenTelemetry with Jaeger
- `solve-math-problem.ts` - Code execution with sub-agents

## Troubleshooting

- **Missing API key:** Ensure `providerKeyName` matches an env var that is set before crew creation.
- **Circular dependencies:** AxCrew detects and reports circular `agents` references.
- **MCP server won't start:** Enable `debug: true` on the agent to see MCP init logs.
- **Sub-agent not visible:** Ensure the sub-agent is added to the crew before the parent agent, or use `addAllAgents()` / `addAgentsToCrew()` for automatic ordering.
- **definition too short:** Must be >= 100 characters. Use `prompt` as an alias.
