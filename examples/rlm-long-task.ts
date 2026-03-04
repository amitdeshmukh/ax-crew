import dotenv from "dotenv";
import { AxJSRuntime, AxJSRuntimePermission } from "@ax-llm/ax";
import { AxCrew } from "../dist/index.js";
import type { AxCrewConfig } from "../dist/index.js";

dotenv.config();

const runtime = new AxJSRuntime({
  permissions: [AxJSRuntimePermission.TIMING],
});

const config: AxCrewConfig = {
  crew: [
    {
      name: "Analyzer",
      description:
        "Analyzes a large dataset with semantic context management.",
      executionMode: "axagent",
      signature:
        'context:string, query:string -> answer:string, keyFindings:string[] "Analyzes context and returns findings"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-flash",
        temperature: 0,
      },
      options: {
        debug: true,
      },
      axAgentOptions: {
        // Mandatory for AxAgent RLM mode
        contextFields: ["context"],
        runtime,
        maxTurns: 20,
        maxSubAgentCalls: 40,
        mode: "simple",
        contextManagement: {
          errorPruning: true,
          hindsightEvaluation: true,
          pruneRank: 2,
          tombstoning: {
            model: "gemini-2.5-flash",
            modelConfig: { maxTokens: 60 },
          },
          stateInspection: { contextThreshold: 3000 },
        },
      },
    },
  ],
};

const salesData = `
Region,Month,Product,Units,Revenue,ReturnRate
North,Jan,Widget-A,1200,48000,0.02
North,Jan,Widget-B,800,32000,0.05
North,Feb,Widget-A,1350,54000,0.018
North,Feb,Widget-B,720,28800,0.06
North,Mar,Widget-A,900,36000,0.03
North,Mar,Widget-B,1100,44000,0.04
South,Jan,Widget-A,980,39200,0.025
South,Jan,Widget-B,1500,60000,0.03
South,Feb,Widget-A,1100,44000,0.02
South,Feb,Widget-B,1300,52000,0.035
South,Mar,Widget-A,760,30400,0.045
South,Mar,Widget-B,1450,58000,0.025
East,Jan,Widget-A,2100,84000,0.015
East,Jan,Widget-B,600,24000,0.07
East,Feb,Widget-A,1950,78000,0.018
East,Feb,Widget-B,650,26000,0.065
East,Mar,Widget-A,2300,92000,0.012
East,Mar,Widget-B,700,28000,0.06
West,Jan,Widget-A,1700,68000,0.022
West,Jan,Widget-B,900,36000,0.04
West,Feb,Widget-A,1600,64000,0.025
West,Feb,Widget-B,950,38000,0.038
West,Mar,Widget-A,1800,72000,0.02
West,Mar,Widget-B,1000,40000,0.035
`.trim();

const main = async (): Promise<void> => {
  const crew = new AxCrew(config);
  try {
    await crew.addAllAgents();

    const analyzer = crew.agents?.get("Analyzer");
    if (!analyzer) throw new Error("Failed to initialize Analyzer");

    const result = await analyzer.forward({
      context: salesData,
      query:
        "Which region and product combination has the highest revenue growth from Jan to Mar? " +
        "Also flag combinations where return rate worsens month-over-month.",
    });

    console.log("\n=== Answer ===");
    console.log(result.answer);
    console.log("\n=== Key Findings ===");
    for (const finding of result.keyFindings ?? []) {
      console.log(" -", finding);
    }

    const agentMetrics = (analyzer as any).getMetrics?.();
    const crewMetrics = crew.getCrewMetrics();

    console.log("\n=== Cost & Usage (Agent) ===");
    console.log(`Estimated USD: ${agentMetrics?.estimatedCostUSD ?? 0}`);
    console.log(
      `Tokens: prompt=${agentMetrics?.tokens?.promptTokens ?? 0}, completion=${agentMetrics?.tokens?.completionTokens ?? 0}, total=${agentMetrics?.tokens?.totalTokens ?? 0}`
    );

    console.log("\n=== Cost & Usage (Crew) ===");
    console.log(`Estimated USD: ${crewMetrics?.estimatedCostUSD ?? 0}`);
    console.log(
      `Tokens: prompt=${crewMetrics?.tokens?.promptTokens ?? 0}, completion=${crewMetrics?.tokens?.completionTokens ?? 0}, total=${crewMetrics?.tokens?.totalTokens ?? 0}`
    );
  } finally {
    crew.destroy();
  }
};

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
