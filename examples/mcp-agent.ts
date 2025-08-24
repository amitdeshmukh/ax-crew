import { AxCrew } from "../dist/index.js";
import type { AxCrewConfig } from "../dist/index.js";

import dotenv from "dotenv";
dotenv.config();

// Define the crew configuration
const config: AxCrewConfig = {
  crew: [
    {
      name: "MapsAgent",
      description: "A specialized agent with access to Google Maps APIs that can: geocode addresses to coordinates and vice versa, search for and get details about places, calculate travel distances and times between multiple locations, provide elevation data, and generate navigation directions between points.",
      signature: 'userQuery:string "a question to be answered" -> answer:string "the answer to the question"',
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-3-5-sonnet-latest",
        temperature: 0,
        maxTokens: 1000,
        stream: true
      },
      options: {
        debug: true
      },
      "mcpServers": {
        "google-maps": {
          "command": "npx",
          "args": [
            "-y",
            "@modelcontextprotocol/server-google-maps"
          ],
          "env": {
            "GOOGLE_MAPS_API_KEY": process.env.GOOGLE_MAPS_API_KEY
          }
        }
      },
    },
    {
      name: "ManagerAgent",
      description: "Completes a user specified task",
      signature:
        'question:string "a question to be answered" -> answer:string "the answer to the question"',
      provider: "openai", 
      providerKeyName: "OPENAI_API_KEY",
      ai: {
        model: "gpt-4o-mini",
        maxTokens: 1000,
        temperature: 0,
        stream: true
      },
      options: {
        debug: true,
      },
      agents: ["MapsAgent"]
    },
    {
      name: "MathAgent",
      description: "Solves math problems",
      signature:
        'mathProblem:string "a sentence describing a math problem to be solved using Python code" -> solution:string "the answer to the math problem"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-1.5-pro",
        temperature: 0,
        stream: true
      },
      options: {
        debug: false,
      },
    },
  ],
};

// Create a new instance of AxCrew with the config
const crew = new AxCrew(config);

// Add the agents to the crew
await crew.addAllAgents();

// Get agent instances
const managerAgent = crew.agents?.get("ManagerAgent");
const mapsAgent = crew.agents?.get("MapsAgent");

const userQuery: string = "Are there any cool bars around the Eiffel Tower in Paris within 5 min walking distance";

console.log(`\n\nQuestion: ${userQuery}`);

const main = async (): Promise<void> => {
    const managerResponse = await managerAgent?.forward({
      question: userQuery,
    });

    console.log(`\nAnswer: ${JSON.stringify(managerResponse?.answer, null, 2)}`);

    // Print metrics
    console.log("\nMetrics:\n+++++++++++++++++++++++++++++++++");
    console.log("Manager Agent Metrics:", JSON.stringify((managerAgent as any)?.getMetrics?.(), null, 2));
    console.log("Maps Agent Metrics:", JSON.stringify((mapsAgent as any)?.getMetrics?.(), null, 2));
    console.log("Crew Metrics:", JSON.stringify((crew as any)?.getCrewMetrics?.(), null, 2));
};

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
