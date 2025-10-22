import { AxCrew } from "../dist/index.js";

import dotenv from "dotenv";
dotenv.config();

// Define the crew configuration
const config = {
  crew: [
    {
      name: "DeepResearchAgent",
      description: "A specialized agent that performs deep research using perplexity",
      signature: 'researchTopic:string "a topic of interest" -> researchResult:string "The result of the research"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-flash-lite",
        temperature: 0.1,
      },
      options: {
        stream: true,
        debug: true,
      },
      mcpServers: {
        "perplexity-mcp": {
          "env": {
            "PERPLEXITY_API_KEY": process.env.PERPLEXITY_API_KEY,
            "PERPLEXITY_MODEL": "sonar-deep-research"
          },
          "command": "uvx",
          "args": [
            "perplexity-mcp"
          ]
        }
      }
    }
  ]
};

// Create a new instance of AxCrew with the config
const crew = new AxCrew(config);

// Add the agents to the crew
await crew.addAllAgents();

// Get agent instances
const researchAgent = crew.agents?.get("DeepResearchAgent");

const userQuery: string = "You are a Research assistant. Your task is to analyse the company SpaceX, its origins, current team members, customer profile and any news worthy happenings. Prepare a detailed report.";

console.log(`\n\nUser Query: ${userQuery}`);

const main = async (): Promise<void> => {
  // Start timing
  const startTime = Date.now();
  console.log(`\n🕐 Starting research task at: ${new Date(startTime).toLocaleTimeString()}`);
  
  const response = await researchAgent?.streamingForward({
    researchTopic: userQuery,
  });

  if (response) {
    try {
      for await (const chunk of response) {
        if (chunk.delta && typeof chunk.delta === 'object' && 'results' in chunk.delta) {
          process.stdout.write(chunk.delta.results);
        }
      }
      console.log('\n');
    } catch (error) {
      console.error('Error processing stream:', error);
    }
  }

  // End timing and calculate duration
  const endTime = Date.now();
  const duration = endTime - startTime;
  const durationInSeconds = (duration / 1000).toFixed(2);
  const durationInMinutes = (duration / 60000).toFixed(2);
  
  console.log(`\n⏱️  Task completed at: ${new Date(endTime).toLocaleTimeString()}`);
  console.log(`⏱️  Total time taken: ${duration}ms (${durationInSeconds}s / ${durationInMinutes}min)`);
};

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
