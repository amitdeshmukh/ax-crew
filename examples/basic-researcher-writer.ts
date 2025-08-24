import { AxCrew } from "../dist/index.js";
import { AxCrewFunctions } from "../dist/functions/index.js";
import type { AxCrewConfig } from "../dist/index.js";
import type { Provider } from "../dist/types.js";

// Example agent configuration
const agentConfig: AxCrewConfig = {
  crew: [
    {
      name: "researcher",
      description: "A research agent that finds information",
      signature: "query:string -> research:string",
      provider: "google-gemini" as Provider,
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-flash-lite",
        maxTokens: 4000
      },
      options: {
        debug: true,
      },
      functions: ["CurrentDateTime"]
    },
    {
      name: "writer",
      description: "A writing agent that creates content",
      signature: "topic:string -> article:string",
      provider: "anthropic" as Provider,
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-3-haiku-20240307",
        maxTokens: 4000
      },
      options: {
        debug: true,
      },
      agents: ["researcher"] // This makes writer use researcher as a sub-agent
    }
  ]
};

// Example usage
async function main() {
  // Initialize the crew
  const crew = new AxCrew(agentConfig, AxCrewFunctions);
  
  // Add agents to the crew
  await crew.addAgentsToCrew(["researcher"]); // Add researcher first
  await crew.addAgentsToCrew(["writer"]); // Then add writer
  
  // Get references to our agents
  const writer = crew.agents?.get("writer");
  const researcher = crew.agents?.get("researcher");
  
  if (!writer || !researcher) {
    throw new Error("Failed to initialize agents");
  }

  try {
    // Use the writer agent (which will internally use the researcher)
    const { article } = await writer.forward({
      topic: "Quantum Computing Benefits",
    });
    console.log("Writer getUsage:", (writer as any).getUsage?.());
    console.log("Researcher getUsage:", (researcher as any).getUsage?.());
    console.log("Crew getUsage:", (crew as any).getUsage?.());


    // Print the article
    console.log("Article:", article);
    
    // Print metrics snapshots (new mechanism)
    console.log("\nMetrics:\n+++++++++++++++++++++++++++++++++");
    console.log("Writer Metrics:", JSON.stringify((writer as any).getMetrics?.(), null, 2));
    console.log("Researcher Metrics:", JSON.stringify((researcher as any).getMetrics?.(), null, 2));
    console.log("Crew Metrics:", JSON.stringify((crew as any).getCrewMetrics?.(), null, 2));

    // If you want to start fresh with cost tracking
    crew.resetCosts();
    
  } finally {
    // Clean up
    crew.destroy();
  }
}

// Run the example
main().catch(console.error);