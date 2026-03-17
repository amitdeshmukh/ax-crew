---
name: ax-crew-telemetry
version: 8.7.2
description: "AxCrew telemetry: OpenTelemetry tracing, metrics, observability with tracer and meter injection."
tags: [telemetry, opentelemetry, tracing, metrics, observability, tracer, meter]
---

# Telemetry

AxCrew accepts OpenTelemetry `tracer` and `meter` instances via the `AxCrewOptions.telemetry` object. When provided, all agent `forward()` and `streamingForward()` calls emit spans and record token/cost metrics automatically.

## AxCrewOptions.telemetry

```ts
interface AxCrewOptions {
  debug?: boolean;
  telemetry?: {
    tracer?: any;  // OpenTelemetry Tracer instance
    meter?: any;   // OpenTelemetry Meter instance
  };
}
```

## Setup

```ts
// Required packages:
// npm install @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/sdk-metrics

import { metrics, trace } from "@opentelemetry/api";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ConsoleMetricExporter, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

// Tracing
const tracerProvider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
});
tracerProvider.register();

// Metrics
const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
      exportIntervalMillis: 5000,
    }),
  ],
});
metrics.setGlobalMeterProvider(meterProvider);

// Get instances
const tracer = trace.getTracer("ax-crew-example");
const meter = metrics.getMeter("ax-crew-example");
```

## Passing to AxCrew

```ts
const crew = new AxCrew(crewConfig, functionsRegistry, {
  telemetry: { tracer, meter },
});
```

The third argument to `AxCrew` is `AxCrewOptions`. Telemetry is optional -- omit it and no spans or metrics are emitted.

## Canonical Pattern

Full working example from `examples/telemetry-demo.ts`:

```ts
import { AxCrew } from "ax-crew";
import { AxCrewFunctions } from "ax-crew/functions";
import type { AxCrewConfig, Provider } from "ax-crew";
import { metrics, trace } from "@opentelemetry/api";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ConsoleMetricExporter, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

// Setup OpenTelemetry
const tracerProvider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
});
tracerProvider.register();

const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
      exportIntervalMillis: 5000,
    }),
  ],
});
metrics.setGlobalMeterProvider(meterProvider);

const tracer = trace.getTracer("my-app");
const meter = metrics.getMeter("my-app");

// Crew config
const crewConfig: AxCrewConfig = {
  crew: [
    {
      name: "Researcher",
      description: "Researches a topic and provides facts.",
      signature: "topic:string -> facts:string[]",
      provider: "openai" as Provider,
      providerKeyName: "OPENAI_API_KEY",
      ai: { model: "gpt-4o-mini", temperature: 0.7 },
      functions: ["CurrentDateTime"],
    },
    {
      name: "Writer",
      description: "Writes a blog post from facts.",
      signature: "facts:string[] -> blogPost:string",
      provider: "google-gemini" as Provider,
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-flash-latest", temperature: 0.7 },
    },
  ],
};

async function main() {
  const crew = new AxCrew(crewConfig, AxCrewFunctions, {
    telemetry: { tracer, meter },
  });

  await crew.addAgent("Researcher");
  await crew.addAgent("Writer");

  const researcher = crew.agents!.get("Researcher")!;
  const writer = crew.agents!.get("Writer")!;

  const researchResult = await researcher.forward({
    topic: "The future of AI agents",
  });

  const writerResult = await writer.forward({
    facts: researchResult.facts,
  });

  console.log(writerResult.blogPost);

  // Wait for metric export flush
  await new Promise((resolve) => setTimeout(resolve, 6000));
  crew.destroy();
}

main().catch(console.error);
```

## Do Not Generate

- Do NOT import OpenTelemetry types from `ax-crew` -- import them from `@opentelemetry/api` and the SDK packages.
- Do NOT pass the `MeterProvider` or `NodeTracerProvider` directly -- pass the `tracer` and `meter` instances obtained via `trace.getTracer()` and `metrics.getMeter()`.
- Do NOT forget to call `tracerProvider.register()` before creating the crew -- spans will not be emitted otherwise.
- Do NOT expect telemetry to work without installing `@opentelemetry/api`, `@opentelemetry/sdk-trace-node`, and `@opentelemetry/sdk-metrics`.

## References

- [telemetry-demo.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/telemetry-demo.ts)
- [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/)
