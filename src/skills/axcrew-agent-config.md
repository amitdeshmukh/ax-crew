---
name: axcrew-agent-config
version: 8.7.3
description: "AgentConfig - agent configuration: provider, signature, model, temperature, definition, prompt, executionMode, axAgentOptions, providerArgs"
---

# AgentConfig

Every agent in a crew is defined by an `AgentConfig` object inside `AxCrewConfig.crew[]`.

## All Fields

```ts
interface AgentConfig {
  // Required
  name: string;                    // Unique agent name
  description: string;             // Short description (used as default system prompt)
  signature: string | AxSignature; // DSPy-style signature, e.g. "query:string -> answer:string"
  provider: Provider;              // "openai" | "anthropic" | "google-gemini" | "azure-openai" | ...
  ai: AxModelConfig & {           // Model configuration
    model: string;                 //   model name (required)
    temperature?: number;          //   sampling temperature
    maxTokens?: number;            //   max output tokens
    stream?: boolean;              //   enable streaming at AI level
  };

  // Optional
  providerKeyName?: string;        // Env var name for API key (e.g. "OPENAI_API_KEY")
  apiURL?: string;                 // Custom API endpoint (e.g. ollama on localhost)
  providerArgs?: Record<string, unknown>; // Provider-specific args forwarded to Ax factory
  definition?: string;             // Detailed system prompt (must be >= 100 chars per Ax)
  prompt?: string;                 // Alias for definition (used if definition is omitted)
  debug?: boolean;                 // Enable debug logging
  options?: Partial<AxProgramForwardOptions<any>> & Record<string, any>; // Forward options + provider-specific keys
  functions?: string[];            // Function names from the registry
  agents?: string[];               // Sub-agent names (must be added to crew first)
  examples?: Array<Record<string, any>>; // DSPy few-shot examples
  mcpServers?: Record<string, MCPTransportConfig>; // MCP server configs
  executionMode?: "axagent" | "axgen"; // Execution engine (default: "axgen")
  axAgentOptions?: AxCrewAxAgentOptions; // AxAgent-specific options (only for executionMode: "axagent")
  ace?: ACEConfig;                 // Optional AxACE optimization config
}
```

## Canonical Pattern

```ts
import { AxCrew } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';

const config: AxCrewConfig = {
  crew: [
    {
      name: "analyzer",
      description: "Analyzes user queries and provides structured responses",
      signature: "userQuery:string -> analysis:string, confidence:number",
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-sonnet-4-20250514",
        temperature: 0.5,
        maxTokens: 2000,
      },
      options: { debug: true, stream: false },
      functions: ["CurrentDateTime"],
    }
  ]
};

async function main() {
  const crew = new AxCrew(config);
  await crew.addAllAgents();
  const analyzer = crew.agents?.get("analyzer");
  const result = await analyzer?.forward({ userQuery: "What is quantum computing?" });
  console.log(result?.analysis, result?.confidence);
  crew.destroy();
}

main().catch(console.error);
```

## Provider Key Pattern

The `providerKeyName` field specifies which environment variable holds the API key. The key is read from `process.env` at agent creation time.

```ts
{
  provider: "openai",
  providerKeyName: "OPENAI_API_KEY",  // reads process.env.OPENAI_API_KEY
}
```

## Azure OpenAI Example

Use `providerArgs` for provider-specific configuration:

```ts
import { AxCrew } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';

const config: AxCrewConfig = {
  crew: [
    {
      name: "TestAgent",
      description: "Test Agent for Azure OpenAI",
      provider: "azure-openai",
      providerKeyName: "AZURE_OPENAI_API_KEY",
      signature: "userQuery:string -> answer:string",
      ai: {
        model: "gpt-5-mini",
        temperature: 0,
        stream: false
      },
      providerArgs: {
        resourceName: "your-resource-name",
        deploymentName: "your-deployment-name",
        version: "2025-01-01-preview"
      },
      options: { debug: true, stream: false }
    }
  ]
};

async function main() {
  const crew = new AxCrew(config);
  await crew.addAllAgents();
  const agent = crew.agents?.get("TestAgent");
  const response = await agent?.forward({ userQuery: "What is the capital of France?" });
  console.log(response?.answer);
  crew.destroy();
}

main().catch(console.error);
```

## Execution Mode

| Mode | Engine | When to use |
|---|---|---|
| `"axgen"` (default) | `AxGen` | Standard prompt-response with tool calling |
| `"axagent"` | `AxAgent` | Full agent capabilities: RLM, context fields, actor/responder split |

When `executionMode: "axagent"`, use `axAgentOptions` for agent-specific settings:

```ts
{
  executionMode: "axagent",
  axAgentOptions: {
    contextFields: ["conversationHistory"],
    // agents: { ... },   // Agent graph config
    // functions: { ... }, // Function graph config
    // actorOptions: { description: "..." },
    // responderOptions: { description: "..." },
  }
}
```

## Signature Format

DSPy-style string signatures with optional field descriptions:

```
"input1:type, input2:type -> output1:type, output2:type"
"topic:string \"The topic\" -> article:string \"The written article\""
"query:string -> results:string[]"
```

Supported types: `string`, `number`, `boolean`, `string[]`, `number[]`, etc.

## Supporting files
- See [examples/providerArgs.ts](examples/providerArgs.ts) for a complete runnable example.

## Do Not Generate

- Do NOT omit `name`, `description`, `signature`, `provider`, or `ai.model` -- all are required.
- Do NOT set `definition` to less than 100 characters if you provide it (Ax enforces this minimum).
- Do NOT confuse `options.stream` (forward option) with `ai.stream` (AI-level streaming config).
- Do NOT use `providerArgs` for API keys; use `providerKeyName` instead.
- Do NOT list sub-agents in `agents` that haven't been added to the crew before the parent agent.

## References

- [basic-researcher-writer.ts](examples/basic-researcher-writer.ts)
- [providerArgs.ts](examples/providerArgs.ts)
