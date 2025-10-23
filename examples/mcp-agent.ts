import { AxCrew } from "../dist/index.js";
import type { AxCrewConfig } from "../dist/types.js";

import dotenv from "dotenv";
dotenv.config();

// Define the crew configuration
const config = {
  crew: [
    {
      name: "Context7DocsAgent",
      description: "A specialized agent with access to Context7 Docs APIs that can: search for and get details about API docs",
      signature: 'apiDocQuery:string "a question to be answered" -> apiDocAnswer:string "the answer to the question"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-pro",
        temperature: 0,
        stream: false
      },
      options: {
        debug: true
      },
      "mcpServers": {
        "context7": {
          "command": "npx",
          "args": ["-y", "@upstash/context7-mcp", "--api-key", process.env.CONTEXT7_API_KEY]
        }
      },
    },
    {
      name: "ManagerAgent",
      description: "Completes a user specified task",
      prompt: "You are a manager agent that orchestrates tools and sub-agents. Read the user's objective, optionally produce a short plan, then call the MapsAgent when geospatial knowledge is needed. Keep answers direct and avoid extraneous commentary.",
      signature:
        'question:string "a question to be answered" -> answer:string "the answer to the question"',
      provider: "google-gemini", 
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-pro",
        maxTokens: 1000,
        temperature: 0,
        stream: false
      },
      options: {
        debug: true,
      },
      agents: ["Context7DocsAgent"]
    }
  ],
};

// Create a new instance of AxCrew with the config
const crew = new AxCrew(config as AxCrewConfig);

// Add the agents to the crew
await crew.addAllAgents();

// Get agent instances
const managerAgent = crew.agents?.get("ManagerAgent");
const context7DocsAgent = crew.agents?.get("Context7DocsAgent");

const userQuery: string = "How do i create an agent in the @amitdeshmukh/ax-crew framework and configure it to use an MCP server? Give me a concrete example.";

console.log(`\n\nQuestion: ${userQuery}`);

const main = async (): Promise<void> => {
    const managerResponse = await managerAgent?.forward({
      question: userQuery,
    });

    console.log(`\nAnswer: ${JSON.stringify(managerResponse?.answer, null, 2)}`);

    // Print metrics
    console.log("\nMetrics:\n+++++++++++++++++++++++++++++++++");
    console.log("Manager Agent Metrics:", JSON.stringify((managerAgent as any)?.getMetrics?.(), null, 2));
    console.log("Context7 Docs Agent Metrics:", JSON.stringify((context7DocsAgent as any)?.getMetrics?.(), null, 2));
    console.log("Crew Metrics:", JSON.stringify((crew as any)?.getCrewMetrics?.(), null, 2));
};

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
