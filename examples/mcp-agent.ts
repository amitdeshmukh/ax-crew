import { AxCrew } from "@amitdeshmukh/ax-crew";

// Define the crew configuration
const config = {
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
      mcpServers: {
        "browser-tools": {
          command: "npx",
          args: [
            "@agentdeskai/browser-tools-mcp@1.1.0"
          ]
        },
        "stdout-mcp-server": {
          command: "npx",
          args: [
            "stdout-mcp-server"
          ]
        },
        "mcp-server-git": {
          command: "uvx",
          args: [
            "mcp-server-git"
          ]
        }
      }      
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
        debug: false,
      },
      agents: ["MathAgent"]
    },
  ],
};

// Create a new instance of AxCrew with the config
const crew = new AxCrew(config);

// Add the agents to the crew
const agents = crew.addAgentsToCrew(["MathAgent", "ManagerAgent"]);

// Get agent instances
const managerAgent = agents?.get("ManagerAgent");
const mathAgent = agents?.get("MathAgent");

const userQuery: string =
  "who is considered as the father of the iphone and what is the 7th root of their year of birth (precision to minimum 5 decimal places)";
console.log(`\n\nQuestion: ${userQuery}`);

const main = async (): Promise<void> => {
  if (managerAgent && mathAgent) {
    const managerResponse = await managerAgent.forward({
      question: userQuery,
    });

    console.log(`\nAnswer: ${JSON.stringify(managerResponse.answer, null, 2)}`);

    // Print usage costs
    console.log("\nUsage:\n+++++++++++++++++++++++++++++++++");
    console.log("Manager Agent:", JSON.stringify(managerAgent.getAccumulatedCosts(), null, 2));
    console.log("Math Agent:", JSON.stringify(mathAgent.getLastUsageCost(), null, 2));
    console.log("Math Agent Accumulated Costs:", JSON.stringify(mathAgent.getAccumulatedCosts(), null, 2));
    console.log("Total Cost:", JSON.stringify(crew.getAggregatedCosts(), null, 2));
  }
};

main().catch(console.error);
