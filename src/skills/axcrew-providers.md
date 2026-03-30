---
name: axcrew-providers
version: 8.7.3
description: "AxCrew provider configuration: openai, anthropic, google-gemini, azure-openai, groq, ollama, mistral, cohere, grok/xAI, perplexity, and model setup."
tags: [provider, openai, anthropic, google-gemini, azure, groq, ollama, mistral, cohere, model, grok, perplexity]
---

# Providers

AxCrew delegates provider instantiation to the Ax `ai()` factory. The `Provider` type is derived from Ax's `AxAIArgs['name']`, so any provider Ax supports is available.

## Provider Type

```ts
type Provider = AxAIArgs<any>['name'];
// Known values: "openai", "anthropic", "google-gemini", "azure-openai",
// "groq", "ollama", "mistral", "cohere", "grok", "deepseek", "huggingface", etc.
```

## AgentConfig Provider Fields

```ts
interface AgentConfig {
  provider: Provider;              // e.g. "openai"
  apiKey?: string | (() => Promise<string>); // direct key or async token-refresh fn
  providerKeyName?: string;        // env var name, e.g. "OPENAI_API_KEY"
  ai: AxModelConfig & { model: string }; // model name + temperature, maxTokens, etc.
  apiURL?: string;                 // custom endpoint (ollama, proxies)
  providerArgs?: Record<string, unknown>; // provider-specific args (azure, etc.)
  options?: Partial<AxProgramForwardOptions<any>> & Record<string, any>; // searchParameters, codeExecution, etc.
}
```

## Dynamic API Key (Token Refresh)

For providers that support it (Google Gemini, Anthropic), `apiKey` can be an async function returning a fresh token. When `apiKey` is set, `providerKeyName` is not required.

```ts
import { GoogleAuth } from "google-auth-library";

const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

const getGoogleToken = async (): Promise<string> => {
  const client = await googleAuth.getClient();
  const response = await client.getAccessToken();
  if (!response.token) throw new Error("Failed to get Google token");
  return response.token;
};

{
  name: "GeminiAgent",
  provider: "google-gemini",
  apiKey: getGoogleToken,
  ai: { model: "gemini-2.0-flash", temperature: 0 },
  providerArgs: {
    projectId: "your-gcp-project-id",
    region: "global",
  },
}
```

## Provider-Specific Configuration

### Azure OpenAI

Use `providerArgs` for Azure-specific fields:

```ts
{
  name: "AzureAgent",
  provider: "azure-openai",
  providerKeyName: "AZURE_OPENAI_API_KEY",
  ai: { model: "gpt-5-mini", temperature: 0 },
  providerArgs: {
    resourceName: "your-resource-name",
    deploymentName: "your-deployment-name",
    version: "2025-01-01-preview",
  },
}
```

### Ollama (Local)

Set `apiURL` to point at the local Ollama endpoint:

```ts
{
  name: "LocalAgent",
  provider: "ollama",
  providerKeyName: "OLLAMA_API_KEY", // can be any non-empty value
  apiURL: "http://localhost:11434",
  ai: { model: "llama3", temperature: 0.7 },
}
```

### Grok / xAI

Use provider `"grok"` with a Grok API key:

```ts
{
  name: "XSearchAgent",
  provider: "grok",
  providerKeyName: "GROK_API_KEY",
  ai: { model: "grok-3-latest", temperature: 0.1 },
  options: {
    stream: true,
    searchParameters: {
      mode: "on",
      returnCitations: true,
      maxSearchResults: 10,
      sources: [
        { type: "x" },
        { type: "web" },
        { type: "news" },
      ],
    },
  },
}
```

### Perplexity (via MCP)

Use any provider as the agent's LLM and attach Perplexity as an MCP server:

```ts
{
  name: "DeepResearchAgent",
  provider: "google-gemini",
  providerKeyName: "GEMINI_API_KEY",
  ai: { model: "gemini-2.5-flash-lite", temperature: 0.1 },
  mcpServers: {
    "perplexity-mcp": {
      command: "uvx",
      args: ["perplexity-mcp"],
      env: {
        PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
        PERPLEXITY_MODEL: "sonar-deep-research",
      },
    },
  },
}
```

## Mixed Providers in One Crew

Each agent can use a different provider. The `providerKeyName` maps to an environment variable read at runtime.

```ts
const config: AxCrewConfig = {
  crew: [
    {
      name: "Planner",
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: { model: "claude-3-5-sonnet-20240620", temperature: 1 },
      signature: "topic:string -> queries:string[]",
      description: "Generates search queries",
    },
    {
      name: "Searcher",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-1.5-pro", temperature: 0.5 },
      signature: "query:string -> results:string",
      description: "Searches the web",
    },
    {
      name: "Writer",
      provider: "openai",
      providerKeyName: "OPENAI_API_KEY",
      ai: { model: "gpt-4o", temperature: 0.8 },
      signature: "topic:string, results:string[] -> post:string",
      description: "Writes content from research",
    },
  ],
};
```

## Canonical Pattern

```ts
import { AxCrew } from "ax-crew";
import type { AxCrewConfig } from "ax-crew";

const config: AxCrewConfig = {
  crew: [
    {
      name: "TestAgent",
      description: "Test Agent for Azure OpenAI",
      provider: "azure-openai",
      providerKeyName: "AZURE_OPENAI_API_KEY",
      signature: "userQuery:string -> answer:string",
      ai: { model: "gpt-5-mini", temperature: 0 },
      providerArgs: {
        resourceName: "your-resource-name",
        deploymentName: "your-deployment-name",
        version: "2025-01-01-preview",
      },
      options: { debug: true, stream: false },
    },
  ],
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

## Supporting files
- See [examples/providerArgs.ts](examples/providerArgs.ts) for Azure OpenAI configuration.
- See [examples/search-tweets.ts](examples/search-tweets.ts) for Grok/xAI usage.
- See [examples/perplexityDeepSearch.ts](examples/perplexityDeepSearch.ts) for Perplexity MCP integration.

## Do Not Generate

- Do NOT hardcode API keys in config -- use `providerKeyName` (env var) or `apiKey` (string or async function).
- Do NOT use `providerArgs` for non-Azure providers unless the Ax factory documents it -- standard providers only need `provider`, `apiKey` or `providerKeyName`, `ai`, and optionally `apiURL`.
- Do NOT confuse `options.searchParameters` (Grok-specific forward option) with `mcpServers` (external tool servers).
- Do NOT set `provider: "perplexity"` -- Perplexity is accessed via an MCP server, not as a native Ax provider.
- Do NOT omit both `apiKey` and `providerKeyName` -- the crew requires at least one to resolve credentials.

## References

- [providerArgs.ts](examples/providerArgs.ts) (Azure OpenAI)
- [search-tweets.ts](examples/search-tweets.ts) (Grok/xAI)
- [perplexityDeepSearch.ts](examples/perplexityDeepSearch.ts) (Perplexity MCP)
- [write-post-and-publish-to-wordpress.ts](examples/write-post-and-publish-to-wordpress.ts) (mixed providers)
- [google-cloud-token-refresh.ts](examples/google-cloud-token-refresh.ts) (dynamic API key)
- [src/agents/compose.ts](src/agents/compose.ts)
