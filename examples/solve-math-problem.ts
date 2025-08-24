import { AxCrew } from "../dist/index.js";
import type { AxCrewConfig } from "../src/index.js";

// Define the crew configuration
const config: AxCrewConfig = {
  crew: [
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
      },
      options: {
        debug: false,
        codeExecution: true,
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
      },
      options: {
        debug: true,
      },
      agents: ["MathAgent"]
    },
  ],
};

// Create a new instance of AxCrew with the config
const crew = new AxCrew(config);

// Add the agents to the crew
await crew.addAgentsToCrew(["MathAgent"]);
await crew.addAgentsToCrew(["ManagerAgent"]);

// Get agent instances
const managerAgent = crew.agents?.get("ManagerAgent");
const mathAgent = crew.agents?.get("MathAgent");

const userQuery: string =
  "who is considered as the father of the iphone and what is the 7th root of their year of birth (precision to minimum 5 decimal places)";
console.log(`\n\nQuestion: ${userQuery}`);

const main = async (): Promise<void> => {
  if (managerAgent && mathAgent) {
    const managerResponse = await managerAgent.forward({
      question: userQuery,
    });

    console.log(`\nAnswer: ${JSON.stringify(managerResponse.answer, null, 2)}`);

    // Print metrics
    console.log("\nMetrics:\n+++++++++++++++++++++++++++++++++");
    console.log("Manager Agent Metrics:", JSON.stringify((managerAgent as any).getMetrics?.(), null, 2));
    console.log("Math Agent Metrics:", JSON.stringify((mathAgent as any).getMetrics?.(), null, 2));
    console.log("Crew Metrics:", JSON.stringify((crew as any).getCrewMetrics?.(), null, 2));
  }
};

main().catch(console.error);
