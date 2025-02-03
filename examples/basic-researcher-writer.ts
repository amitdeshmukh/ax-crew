;import { AxCrew } from "../dist/index.js";

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
        model: "claude-3-opus-20240229"
      }
    },
    {
      name: "writer",
      description: "A writing agent that creates content",
      signature: "topic:string, research:string -> article:string",
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-3-sonnet-20240229"
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
    // Use the researcher agent
    const { research } = await researcher.forward({
      query: "What are the key benefits of quantum computing?"
    });
    
    // Use the writer agent (which will internally use the researcher)
    const article = await writer.forward({
      topic: "Quantum Computing Benefits",
      research: research
    });

    // Print the article
    console.log("Article:", article);

    // Get costs for individual agents
    const researcherCost = researcher.getUsageCost();
    console.log("Researcher cost:", researcherCost);
    
    // Get aggregated costs for all agents (includes both direct calls and sub-agent calls)
    const totalCosts = writer.getAggregatedCosts();
    console.log("Total cost breakdown:", JSON.stringify(totalCosts, null, 2));

    // If you want to start fresh with cost tracking
    writer.resetCosts();
    
  } finally {
    // Clean up
    crew.destroy();
  }
}

// Run the example
main().catch(console.error);