---
name: ax-crew-streaming
version: "__VERSION__"
description: "ax-crew streaming patterns: streaming, streamingForward, stream, delta, real-time, chunks, async generator consumption"
argument-hint: [topic]
allowed-tools: Read, Grep, Glob
---

# ax-crew Streaming

## streamingForward() vs forward()

`forward()` returns `Promise<Record<string, any>>` -- waits for full response.
`streamingForward()` returns `AxGenStreamingOut<any>` -- an async generator yielding chunks as they arrive.

Both accept the same input values object. Both work with `axgen` and `axagent` execution modes.

```typescript
// Blocking
const result = await agent.forward({ question: "What is AI?" });
console.log(result.answer);

// Streaming
const stream = agent.streamingForward({ question: "What is AI?" });
for await (const chunk of stream) {
  if (chunk.delta && 'answer' in chunk.delta) {
    process.stdout.write(chunk.delta.answer);
  }
}
```

## chunk.delta Structure

Each yielded chunk has a `delta` property containing partial values keyed by output field names from the agent's signature.

```typescript
// For signature: 'question:string -> answer:string'
// chunk.delta = { answer: "partial text..." }

// For signature: 'query:string -> title:string, summary:string'
// chunk.delta may contain { title: "..." } or { summary: "..." }
```

Always check for the field's existence before accessing:
```typescript
if (chunk.delta && typeof chunk.delta === 'object' && 'answer' in chunk.delta) {
  process.stdout.write(chunk.delta.answer);
}
```

## Stream Config in Agent Config

Enable streaming at the provider level via `ai.stream` or `options.stream`:

```typescript
{
  name: "StreamAgent",
  ai: { model: "gemini-2.5-flash", stream: true },   // provider-level
  options: { stream: true },                           // forward options level
}
```

## Overload Signatures

```typescript
// Without explicit AI instance (uses agent's configured AI)
agent.streamingForward(values: Record<string, any>, options?: AxProgramStreamingForwardOptions): AxGenStreamingOut<any>;

// With explicit AI instance
agent.streamingForward(ai: AxAI, values: Record<string, any>, options?: AxProgramStreamingForwardOptions): AxGenStreamingOut<any>;
```

## Canonical Pattern

```typescript
import { AxCrew } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';

const config: AxCrewConfig = {
  crew: [
    {
      name: "ManagerAgent",
      description: "Completes a user specified task",
      signature:
        'question:string "a question to be answered" -> answer:string "the answer to the question"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", maxTokens: 1000, temperature: 0 },
      options: { debug: true, stream: true },
      agents: ["MathAgent"],
    },
    {
      name: "MathAgent",
      description: "Solves math problems",
      signature:
        'mathProblem:string "a math problem" -> solution:string "the answer"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-pro", temperature: 0 },
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  await crew.addAllAgents();

  const agent = crew.agents?.get("ManagerAgent");
  if (!agent) throw new Error("Agent not found");

  const stream = agent.streamingForward({
    question: "Get me the first 5 fibonacci numbers divided by 2",
  });

  for await (const chunk of stream) {
    if (chunk.delta && typeof chunk.delta === 'object' && 'answer' in chunk.delta) {
      process.stdout.write(chunk.delta.answer);
    }
  }
  console.log('\n');

  // Metrics still available after streaming
  console.log("Agent Metrics:", JSON.stringify(agent.getMetrics?.(), null, 2));
  console.log("Crew Metrics:", JSON.stringify(crew.getCrewMetrics(), null, 2));

  crew.destroy();
}

main().catch(console.error);
```

## Do Not Generate

- Do NOT `await` the return of `streamingForward()` -- it returns the async generator directly, not a promise.
- Do NOT assume `chunk.delta` is always a string -- it is an object keyed by output field names.
- Do NOT forget to check field existence in `chunk.delta` before accessing (`'fieldName' in chunk.delta`).
- Do NOT use `forward()` with the expectation of receiving streaming chunks -- use `streamingForward()`.
- Do NOT skip `crew.destroy()` -- it cleans up MCP servers and resources.

## References

- [streaming.ts example](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/streaming.ts)
- [Source: StatefulAxAgent.streamingForward](https://github.com/amitdeshmukh/ax-crew/blob/main/src/agents/index.ts)
