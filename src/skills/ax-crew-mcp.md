---
name: ax-crew-mcp
version: "8.7.2"
description: "ax-crew MCP integration: MCP, Model Context Protocol, STDIO, HTTP SSE, Streamable HTTP, mcpServers, tools, tool filtering, multiple servers"
argument-hint: [topic]
allowed-tools: Read, Grep, Glob
---

# ax-crew MCP (Model Context Protocol)

MCP servers expose external tools to agents. Configured per-agent via `mcpServers` in the agent config. Transport type is auto-detected by config shape.

## Three Transport Types

### STDIO (local process)

```typescript
mcpServers: {
  "context7": {
    command: "npx",                              // required
    args: ["-y", "@upstash/context7-mcp"],       // optional
    env: { API_KEY: "..." },                     // optional
    tools: ["resolve-library-id", "query-docs"], // optional allowlist
  }
}
```

Type: `MCPStdioTransportConfig = { command: string; args?: string[]; env?: NodeJS.ProcessEnv; tools?: string[] }`

### HTTP SSE (remote, server-sent events)

```typescript
mcpServers: {
  "api-server": {
    sseUrl: "https://api.example.com/mcp/sse",   // required
    tools: ["search", "fetch"],                    // optional allowlist
  }
}
```

Type: `MCPHTTPSSETransportConfig = { sseUrl: string; tools?: string[] }`

### Streamable HTTP (bidirectional)

```typescript
mcpServers: {
  "graphjin": {
    mcpEndpoint: "http://localhost:8080/api/v1/mcp",  // required
    options: { timeout: 30000 },                       // optional AxMCPStreamableHTTPTransportOptions
    tools: ["list_workflows", "execute_workflow"],      // optional allowlist
  }
}
```

Type: `MCPStreamableHTTPTransportConfig = { mcpEndpoint: string; options?: AxMCPStreamableHTTPTransportOptions; tools?: string[] }`

## tools[] Allowlist

When `tools` is specified, only those MCP tool names are exposed to the agent. This reduces token usage and prevents the agent from calling unwanted tools.

```typescript
mcpServers: {
  "big-server": {
    command: "npx",
    args: ["-y", "some-mcp-server"],
    tools: ["only_this_tool", "and_this_one"],  // filter from all available
  }
}
```

If `tools` is omitted or empty, all tools from the MCP server are exposed.

## Multiple MCP Servers Per Agent

An agent can connect to multiple MCP servers simultaneously. All tools are merged:

```typescript
{
  name: "MultiToolAgent",
  description: "Agent with multiple MCP servers",
  signature: 'query:string -> answer:string',
  provider: "google-gemini",
  providerKeyName: "GEMINI_API_KEY",
  ai: { model: "gemini-2.5-pro", temperature: 0 },
  mcpServers: {
    "filesystem": {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    },
    "database": {
      mcpEndpoint: "http://localhost:8080/api/v1/mcp",
      tools: ["query", "describe_table"],
    }
  }
}
```

## Canonical Pattern

### STDIO transport (from mcp-agent.ts)

```typescript
import { AxCrew } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';

const config: AxCrewConfig = {
  crew: [
    {
      name: "Context7DocsAgent",
      description: "Agent with access to Context7 Docs APIs",
      signature: 'apiDocQuery:string "a question" -> apiDocAnswer:string "the answer"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-pro", temperature: 0 },
      options: { debug: true },
      mcpServers: {
        "context7": {
          command: "npx",
          args: ["-y", "@upstash/context7-mcp", "--api-key", process.env.CONTEXT7_API_KEY!],
        },
      },
    },
    {
      name: "ManagerAgent",
      description: "Orchestrates sub-agents",
      signature: 'question:string -> answer:string',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-pro", maxTokens: 1000, temperature: 0 },
      agents: ["Context7DocsAgent"],
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  try {
    await crew.addAllAgents();

    const manager = crew.agents?.get("ManagerAgent");
    if (!manager) throw new Error("Agent not found");

    const result = await manager.forward({
      question: "How do I configure MCP servers in ax-crew?",
    });
    console.log("Answer:", result.answer);
  } finally {
    crew.destroy();
  }
}

main().catch(console.error);
```

### Streamable HTTP transport (from graphjin-database-agent.ts)

```typescript
import { AxCrew } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';

const config: AxCrewConfig = {
  crew: [
    {
      name: "DatabaseAgent",
      description: "Agent with direct database access via GraphJin",
      signature: 'dbQuery:string "a database question" -> dbResult:string "the result"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-pro", temperature: 0 },
      mcpServers: {
        "graphjin": {
          command: "graphjin",
          args: ["mcp", "--server", "http://localhost:8080"],
        },
      },
    },
    {
      name: "ManagerAgent",
      description: "Orchestrates database queries",
      signature: 'question:string -> answer:string',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-pro", maxTokens: 2000, temperature: 0 },
      agents: ["DatabaseAgent"],
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  try {
    await crew.addAllAgents();
    const manager = crew.agents?.get("ManagerAgent");
    if (!manager) throw new Error("Agent not found");

    const result = await manager.forward({
      question: "What tables are available in the database?",
    });
    console.log("Answer:", result.answer);
  } finally {
    crew.destroy();
  }
}

main().catch(console.error);
```

## Do Not Generate

- Do NOT mix transport config keys -- use exactly one of `command`, `sseUrl`, or `mcpEndpoint` per server entry.
- Do NOT forget `crew.destroy()` -- MCP STDIO processes must be cleaned up.
- Do NOT put `mcpServers` at the crew level -- it is per-agent only.
- Do NOT assume MCP tools have `parameters` -- some zero-arg tools omit it; ax-crew normalizes this automatically.
- Do NOT use `AxMCPStdioTransport` directly -- ax-crew handles transport creation internally from config.

## References

- [mcp-agent.ts example](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/mcp-agent.ts)
- [graphjin-database-agent.ts example](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/graphjin-database-agent.ts)
- [Source: agentConfig.ts (initializeMCPServers)](https://github.com/amitdeshmukh/ax-crew/blob/main/src/agents/agentConfig.ts)
- [Types: MCPStdioTransportConfig, MCPHTTPSSETransportConfig, MCPStreamableHTTPTransportConfig](https://github.com/amitdeshmukh/ax-crew/blob/main/src/types.ts)
