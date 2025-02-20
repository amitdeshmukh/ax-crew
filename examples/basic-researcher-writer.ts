import { AxCrew } from "@amitdeshmukh/ax-crew";

// Example agent configuration
const agentConfig = {
  crew: [
    {
      name: "researcher",
      description: "A research agent that finds information",
      signature: "query:string -> research:string",
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-3-sonnet-20240229"
      },
      options: {
        debug: true,
      },
    },
    {
      name: "writer",
      description: "A writing agent that creates content",
      signature: "topic:string -> article:string",
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-3-sonnet-20240229"
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
  const crew = new AxCrew(agentConfig);
  
  // Add agents to the crew
  crew.addAgentsToCrew(["researcher", "writer"]);
  
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

    // Print the article
    console.log("Article:", article);
    
    // Print usage costs
    console.log("\nUsage:\n+++++++++++++++++++++++++++++++++");
    console.log("Writer Agent:", JSON.stringify(writer.getAccumulatedCosts(), null, 2));
    console.log("Researcher Agent Last Usage:", JSON.stringify(researcher.getLastUsageCost(), null, 2));
    console.log("Researcher Agent Accumulated:", JSON.stringify(researcher.getAccumulatedCosts(), null, 2));
    console.log("Total Cost:", JSON.stringify(crew.getAggregatedCosts(), null, 2));

    // If you want to start fresh with cost tracking
    crew.resetCosts();
    
  } finally {
    // Clean up
    crew.destroy();
  }
}

// Run the example
main().catch(console.error);