---
name: axcrew-patterns
version: 8.7.3
description: "AxCrew multi-agent patterns: pipeline, delegation, fan-out, orchestrator, sequential workflows, and agent coordination."
tags: [patterns, workflow, pipeline, multi-agent, orchestrator, delegation, sequential, fan-out]
---

# Multi-Agent Patterns

## Pipeline Pattern (A -> B -> C)

Sequential agent calls where each agent's output feeds the next. Each agent is independent -- the orchestration happens in your code.

```ts
import { AxCrew } from "ax-crew";
import type { AxCrewConfig, Provider } from "ax-crew";

const config: AxCrewConfig = {
  crew: [
    {
      name: "Planner",
      description: "Generates search queries for a topic",
      signature: 'topic:string, guidance:string -> queries:string[]',
      provider: "anthropic" as Provider,
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: { model: "claude-3-5-sonnet-20240620", temperature: 1 },
    },
    {
      name: "Searcher",
      description: "Searches the web for a query",
      signature: 'query:string -> searchResult:string',
      provider: "google-gemini" as Provider,
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-1.5-pro", temperature: 0.5 },
      options: {
        googleSearchRetrieval: { mode: "MODE_UNSPECIFIED" },
      },
    },
    {
      name: "Writer",
      description: "Writes a blog post from research",
      signature: 'topic:string, guidance:string, searchResults:string[] -> title:string, content:string',
      provider: "anthropic" as Provider,
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: { model: "claude-3-5-sonnet-20240620", temperature: 1 },
    },
    {
      name: "Publisher",
      description: "Publishes a post to WordPress",
      signature: 'title:string, content:string, status:string -> postResponse:string',
      provider: "anthropic" as Provider,
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: { model: "claude-3-5-sonnet-20240620", temperature: 0 },
      functions: ["WordPressPost"],
    },
  ],
};

async function main() {
  const crew = new AxCrew(config, customFunctions);
  const agents = await crew.addAgentsToCrew([
    "Planner", "Searcher", "Writer", "Publisher",
  ]);

  const planner = agents!.get("Planner")!;
  const searcher = agents!.get("Searcher")!;
  const writer = agents!.get("Writer")!;
  const publisher = agents!.get("Publisher")!;

  const topic = "How to tell what your dog is thinking";
  const guidance = "Fun, engaging, under 500 words.";

  // Step 1: Plan
  const { queries } = await planner.forward({ topic, guidance });

  // Step 2: Research (sequential to avoid rate limits)
  const searchResults: string[] = [];
  for (const query of queries) {
    const { searchResult } = await searcher.forward({ query });
    searchResults.push(searchResult);
  }

  // Step 3: Write
  const { title, content } = await writer.forward({ topic, guidance, searchResults });

  // Step 4: Publish
  const { postResponse } = await publisher.forward({ title, content, status: "draft" });
  console.log(postResponse);

  crew.destroy();
}

main().catch(console.error);
```

## Delegation Pattern (Sub-Agents)

Use `agents[]` in config to give one agent access to other agents as tools. The parent agent decides when to delegate. Sub-agents must be added to the crew **before** the parent.

```ts
const config: AxCrewConfig = {
  crew: [
    {
      name: "MathAgent",
      description: "Solves math problems using Python code execution",
      signature: 'mathProblem:string -> solution:string',
      provider: "google-gemini" as Provider,
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash-lite", temperature: 0 },
      options: { codeExecution: true },
    },
    {
      name: "ManagerAgent",
      description: "Answers questions, delegating math to MathAgent",
      signature: 'question:string -> answer:string',
      provider: "google-gemini" as Provider,
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash-lite", maxTokens: 1000, temperature: 0 },
      agents: ["MathAgent"],  // <-- delegation
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);

  // Order matters: sub-agents first, then parent
  await crew.addAgentsToCrew(["MathAgent"]);
  await crew.addAgentsToCrew(["ManagerAgent"]);

  const manager = crew.agents!.get("ManagerAgent")!;
  const result = await manager.forward({
    question: "What is the 7th root of 1955?",
  });
  console.log(result.answer);

  crew.destroy();
}

main().catch(console.error);
```

Note: `addAgentsToCrew(["MathAgent", "ManagerAgent"])` also works -- it resolves dependencies automatically.

## Fan-Out Pattern (Parallel Agents)

Run multiple agents concurrently with `Promise.all`:

```ts
async function main() {
  const crew = new AxCrew(config);
  await crew.addAllAgents();

  const analyst = crew.agents!.get("Analyst")!;
  const reviewer = crew.agents!.get("Reviewer")!;
  const factChecker = crew.agents!.get("FactChecker")!;

  const input = { document: "..." };

  // Fan-out: run all three in parallel
  const [analysis, review, facts] = await Promise.all([
    analyst.forward(input),
    reviewer.forward(input),
    factChecker.forward(input),
  ]);

  // Merge results downstream
  const synthesizer = crew.agents!.get("Synthesizer")!;
  const final = await synthesizer.forward({
    analysis: analysis.result,
    review: review.result,
    facts: facts.result,
  });

  crew.destroy();
}
```

## Orchestrator Pattern

A manager agent with multiple specialist sub-agents. The manager decides which specialist(s) to invoke based on the query.

```ts
const config: AxCrewConfig = {
  crew: [
    {
      name: "CodeAgent",
      description: "Writes and reviews code",
      signature: "task:string -> code:string",
      provider: "anthropic" as Provider,
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: { model: "claude-3-5-sonnet-20240620", temperature: 0 },
    },
    {
      name: "ResearchAgent",
      description: "Researches technical topics",
      signature: "topic:string -> findings:string",
      provider: "openai" as Provider,
      providerKeyName: "OPENAI_API_KEY",
      ai: { model: "gpt-4o", temperature: 0.5 },
    },
    {
      name: "Orchestrator",
      description: "Routes tasks to the right specialist and synthesizes results",
      signature: "request:string -> response:string",
      provider: "anthropic" as Provider,
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: { model: "claude-3-5-sonnet-20240620", temperature: 0.3 },
      agents: ["CodeAgent", "ResearchAgent"],  // can delegate to either
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  await crew.addAgentsToCrew(["CodeAgent", "ResearchAgent", "Orchestrator"]);

  const orchestrator = crew.agents!.get("Orchestrator")!;
  const result = await orchestrator.forward({
    request: "Research WebSocket best practices and write a TypeScript echo server",
  });
  console.log(result.response);

  crew.destroy();
}

main().catch(console.error);
```

## definition / prompt for System Prompts

Use `definition` (or its alias `prompt`) to provide a detailed system prompt. Must be at least 100 characters. If both are set, `definition` takes precedence.

```ts
{
  name: "Writer",
  description: "Short description (used as tool description for sub-agent delegation)",
  definition: `You are a senior technical writer specializing in developer documentation.
Follow the Divio documentation framework: tutorials, how-to guides, reference, explanation.
Always include code examples. Use active voice. Keep paragraphs under 4 sentences.
Target audience: intermediate developers familiar with TypeScript.`,
  signature: "topic:string -> documentation:string",
  provider: "anthropic" as Provider,
  providerKeyName: "ANTHROPIC_API_KEY",
  ai: { model: "claude-3-5-sonnet-20240620", temperature: 0.7 },
}
```

## Shared State Across Agents

All agents in a crew share a mutable `state` object for out-of-band data passing:

```ts
crew.crewState.set("env", { WORDPRESS_URL: "http://...", WORDPRESS_USERNAME: "..." });
crew.crewState.set("context", { userId: "abc-123" });

// Inside a custom function, state is accessible via the constructor:
class MyTool {
  constructor(private state: Record<string, any>) {}
  toFunction() {
    return {
      name: "myTool",
      description: "...",
      parameters: { ... },
      func: async () => {
        const env = this.state.env;  // access shared state
        // ...
      },
    };
  }
}
```

## Supporting files
- See [examples/write-post-and-publish-to-wordpress.ts](examples/write-post-and-publish-to-wordpress.ts) for a complete pipeline example.
- See [examples/solve-math-problem.ts](examples/solve-math-problem.ts) for a delegation example.

## Do Not Generate

- Do NOT add a parent agent before its sub-agents -- `addAgentsToCrew` resolves dependencies but `addAgent` does not.
- Do NOT use `agents: ["SelfName"]` -- an agent cannot be its own sub-agent (circular dependency error).
- Do NOT assume agents share conversation context -- they share `crewState` but each `forward()` call is independent. Pass data explicitly via signatures.
- Do NOT use `definition` shorter than 100 characters -- Ax requires minimum length for program definitions.
- Do NOT confuse `description` (used as the tool description when this agent is a sub-agent) with `definition` (the system prompt).

## References

- [write-post-and-publish-to-wordpress.ts](examples/write-post-and-publish-to-wordpress.ts) (4-agent pipeline)
- [solve-math-problem.ts](examples/solve-math-problem.ts) (delegation)
- [search-tweets.ts](examples/search-tweets.ts) (streaming)
