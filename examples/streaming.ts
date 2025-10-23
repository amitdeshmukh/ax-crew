import { AxCrew } from "../dist/index.js";
import type { AxCrewConfig } from "../src/index.js";

import dotenv from "dotenv";
dotenv.config();

// Define the crew configuration
const config: AxCrewConfig = {
  crew: [
    {
      name: "ManagerAgent",
      description: "Completes a user specified task",
      signature:
        'question:string "a question to be answered" -> answer:string "the answer to the question"',
      provider: "google-gemini", 
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-flash",
        maxTokens: 1000,
        temperature: 0,
      },
      options: {
        debug: true,
        stream: true,
      },
      agents: ["MathAgent"]
    },
    {
      name: "MathAgent",
      description: "Solves math problems",
      signature:
        'mathProblem:string "a sentence describing a math problem to be solved using Python code" -> solution:string "the answer to the math problem"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-pro",
        temperature: 0,
      },
      options: {
        debug: false,
        codeExecution: true,
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
const mathAgent = crew.agents?.get("MathAgent");

const userQuery: string = "Get me the first 5 fibonacci numbers divided by 2";

console.log(`\n\nQuestion: ${userQuery}`);

const main = async (): Promise<void> => {
    const managerResponse = await managerAgent?.streamingForward({
      question: userQuery,
    });

    if (managerResponse) {
      try {
        for await (const chunk of managerResponse) {
          if (chunk.delta && typeof chunk.delta === 'object' && 'answer' in chunk.delta) {
            process.stdout.write(chunk.delta.answer);
          }
        }
        console.log('\n');
      } catch (error) {
        console.error('Error processing stream:', error);
      }
    }

    // Print metrics
    console.log("\nMetrics:\n+++++++++++++++++++++++++++++++++");
    console.log("Manager Agent Metrics:", JSON.stringify((managerAgent as any)?.getMetrics?.(), null, 2));
    console.log("Math Agent Metrics:", JSON.stringify((mathAgent as any)?.getMetrics?.(), null, 2));
    console.log("Crew Metrics:", JSON.stringify((crew as any)?.getCrewMetrics?.(), null, 2));
};

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
