
import { AxCrew } from "../dist/index.js";
import { AxCrewFunctions } from "../dist/functions/index.js";
import type { AxCrewConfig } from "../dist/types.js";
import type { Provider } from "../dist/types.js";
import "dotenv/config";

// Import OpenTelemetry packages
// Note: In a real project, you would need to install these dependencies:
// npm install @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/sdk-metrics
// Optional: npm install @opentelemetry/exporter-jaeger (for Jaeger UI visualization)
import { metrics, trace } from "@opentelemetry/api";
import {
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import {
  ConsoleMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

// Optional Jaeger import - will be used if available
let JaegerExporter;
try {
  JaegerExporter = (await import('@opentelemetry/exporter-jaeger')).JaegerExporter;
} catch (error) {
  console.log('Jaeger exporter not available. Install with: npm install @opentelemetry/exporter-jaeger');
  console.log('Traces will only be sent to console.');
}

// --- 1. Setup OpenTelemetry (Console + Optional Jaeger) ---

// Set up tracing to console and optionally Jaeger
const spanProcessors = [new SimpleSpanProcessor(new ConsoleSpanExporter())];

// Add Jaeger if available
if (JaegerExporter) {
  try {
    spanProcessors.push(new SimpleSpanProcessor(new JaegerExporter({
      endpoint: 'http://localhost:14268/api/traces',
    })));
    console.log('Jaeger tracing enabled. View traces at: http://localhost:16686');
  } catch (error) {
    console.log('Failed to initialize Jaeger exporter:', error.message);
    console.log('Continuing with console tracing only.');
  }
}

const tracerProvider = new NodeTracerProvider({
  spanProcessors
});
tracerProvider.register(); // This registers it as the global tracer provider

// Set up basic metrics to print to console
const meterProvider = new MeterProvider({
  readers: [
    new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
      exportIntervalMillis: 5000, // Export every 5 seconds
    }),
  ],
});
metrics.setGlobalMeterProvider(meterProvider);

// Get your tracer and meter instances
const tracer = trace.getTracer("ax-crew-example");
const meter = metrics.getMeter("ax-crew-example");

// --- 2. Define Crew Configuration ---

const crewConfig: AxCrewConfig = {
  crew: [
    {
      name: "Researcher",
      description: "Researches a topic using tools and provides a summary.",
      signature: "topic:string -> facts:string[]",
      // Agent 1 uses OpenAI
      provider: "openai" as Provider,
      providerKeyName: "OPENAI_API_KEY",
      ai: {
        model: "gpt-4o-mini",
        temperature: 0.7,
      },
      // Give this agent access to a tool (function)
      functions: ["CurrentDateTime"]
    },
    {
      name: "Writer",
      description: "Writes a blog post based on provided facts.",
      signature: "facts:string[] -> blogPost:string",
      // Agent 2 uses a different provider (e.g., Google Gemini)
      provider: "google-gemini" as Provider,
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-flash-latest",
        temperature: 0.7,
      },
      // No tools for this agent, just pure generation
    }
  ]
};

// --- 3. Run the Crew ---

async function main() {
  console.log("Starting AxCrew with Telemetry...");

  // Initialize AxCrew with the telemetry options
  const crew = new AxCrew(
    crewConfig,
    AxCrewFunctions,
    undefined, // Use default crewId
    {
      telemetry: {
        tracer,
        meter
      }
    }
  );

  try {
    // Initialize agents
    await crew.addAgent("Researcher");
    await crew.addAgent("Writer");

    const researcher = crew.agents!.get("Researcher")!;
    const writer = crew.agents!.get("Writer")!;

    // Step 1: Research
    console.log("\n--- Step 1: Researching ---");
    // This call will be traced, including the 'CurrentDateTime' tool usage
    const researchResult = await researcher.forward({
      topic: "The future of AI agents in 2025"
    });
    console.log("Research output:", researchResult.facts);

    // Step 2: Writing
    console.log("\n--- Step 2: Writing ---");
    // This call will be traced under a different provider
    const writerResult = await writer.forward({
      facts: researchResult.facts
    });
    console.log("Blog Post:\n", writerResult.blogPost);

    console.log("\n--- Done ---");
    console.log("Check your console output above for OpenTelemetry traces and metrics.");
    if (JaegerExporter) {
      console.log("Check Jaeger UI at http://localhost:16686 for enhanced trace visualization.");
    } else {
      console.log("For enhanced visualization, install Jaeger: npm install @opentelemetry/exporter-jaeger");
      console.log("Then run: docker run -d --name jaeger -p 16686:16686 -p 14268:14268 jaegertracing/all-in-one:latest");
    }

    // Wait a moment for metrics to export before exiting
    await new Promise(resolve => setTimeout(resolve, 6000));

  } catch (error) {
    console.error("Error running crew:", error);
  } finally {
    crew.destroy();
  }
}

main().catch(console.error);
