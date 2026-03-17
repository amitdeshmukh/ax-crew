---
name: ax-crew-metrics
version: "__VERSION__"
description: "ax-crew metrics and cost tracking: metrics, cost, tracking, getMetrics, getCrewMetrics, MetricsSnapshot, usage, tokens, estimatedCostUSD, resetCosts, resetCrewMetrics"
argument-hint: [topic]
allowed-tools: Read, Grep, Glob
---

# ax-crew Metrics & Cost Tracking

## Per-Agent: agent.getMetrics()

Returns a `MetricsSnapshot` scoped to this agent within its crew.

```typescript
const agent = crew.agents?.get("MyAgent");
const metrics = agent.getMetrics();
```

## Crew-Level: crew.getCrewMetrics()

Returns a `MetricsSnapshot` aggregated across all agents in the crew.

```typescript
const crewMetrics = crew.getCrewMetrics();
```

## MetricsSnapshot Shape

```typescript
interface MetricsSnapshot {
  provider?: string;
  model?: string;
  requests: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;               // errors / requests
    totalStreamingRequests: number;
    durationMsSum: number;
    durationCount: number;
  };
  tokens: {
    promptTokens: number;
    completionTokens: number;
    totalTokens?: number;
  };
  estimatedCostUSD: number;          // rounded to 5 decimal places
  functions: {
    totalFunctionCalls: number;
    totalFunctionLatencyMs: number;
    details?: Array<{                // per-function breakdown
      name: string;
      calls: number;
      totalLatencyMs: number;
    }>;
  };
}
```

## Reset Methods

```typescript
// Reset all cost/usage tracking for the entire crew (resets agent usage + metrics)
crew.resetCosts();

// Reset only the metrics registry for the crew
crew.resetCrewMetrics();
```

`resetCosts()` calls `resetUsage()` and `resetMetrics()` on each agent, then clears crew-level metrics.
`resetCrewMetrics()` only clears the MetricsRegistry entries for this crew.

## Canonical Pattern

```typescript
import { AxCrew, AxCrewFunctions } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig } from '@amitdeshmukh/ax-crew';

const config: AxCrewConfig = {
  crew: [
    {
      name: "researcher",
      description: "A research agent that finds information",
      signature: "query:string -> research:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash-lite", maxTokens: 4000, stream: true },
      functions: ["CurrentDateTime"],
    },
    {
      name: "writer",
      description: "A writing agent that creates content",
      signature: "topic:string -> article:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash-lite", maxTokens: 4000, stream: true },
      agents: ["researcher"],
    },
  ],
};

async function main() {
  const crew = new AxCrew(config, AxCrewFunctions);
  await crew.addAgentsToCrew(["researcher"]);
  await crew.addAgentsToCrew(["writer"]);

  const writer = crew.agents?.get("writer");
  const researcher = crew.agents?.get("researcher");
  if (!writer || !researcher) throw new Error("Failed to initialize agents");

  try {
    const { article } = await writer.forward({
      topic: "Quantum Computing Benefits",
    });
    console.log("Article:", article);

    // Per-agent metrics
    console.log("Writer Metrics:", JSON.stringify(writer.getMetrics?.(), null, 2));
    console.log("Researcher Metrics:", JSON.stringify(researcher.getMetrics?.(), null, 2));

    // Crew-wide aggregate
    console.log("Crew Metrics:", JSON.stringify(crew.getCrewMetrics(), null, 2));

    // Reset for next measurement period
    crew.resetCosts();
  } finally {
    crew.destroy();
  }
}

main().catch(console.error);
```

## Accessing Specific Fields

```typescript
const m = agent.getMetrics();

// Cost
console.log(`Estimated USD: ${m?.estimatedCostUSD ?? 0}`);

// Tokens
console.log(`Prompt: ${m?.tokens?.promptTokens}, Completion: ${m?.tokens?.completionTokens}, Total: ${m?.tokens?.totalTokens}`);

// Request stats
console.log(`Requests: ${m?.requests?.totalRequests}, Errors: ${m?.requests?.totalErrors}`);

// Function calls
console.log(`Function calls: ${m?.functions?.totalFunctionCalls}`);
if (m?.functions?.details) {
  for (const fn of m.functions.details) {
    console.log(`  ${fn.name}: ${fn.calls} calls, ${fn.totalLatencyMs}ms`);
  }
}
```

## Do Not Generate

- Do NOT call `getMetrics()` on the crew object -- use `crew.getCrewMetrics()` for crew-level and `agent.getMetrics()` for per-agent.
- Do NOT confuse `resetCosts()` with `resetCrewMetrics()` -- `resetCosts()` is broader (resets agent usage too).
- Do NOT expect `getMetrics()` to return cost data from the legacy `getUsage()` / `getCosts()` API -- those are separate.
- Do NOT assume `functions.details` is always present -- it is `undefined` when no function calls have been made.
- Do NOT forget that `estimatedCostUSD` is an estimate based on tracked token counts and model pricing.

## References

- [basic-researcher-writer.ts example](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/basic-researcher-writer.ts)
- [rlm-long-task.ts example](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/rlm-long-task.ts)
- [Source: MetricsSnapshot type](https://github.com/amitdeshmukh/ax-crew/blob/main/src/metrics/types.ts)
- [Source: MetricsRegistry](https://github.com/amitdeshmukh/ax-crew/blob/main/src/metrics/registry.ts)
