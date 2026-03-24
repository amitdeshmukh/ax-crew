import { AxCrew } from "../dist/index.js";
import type { AxCrewConfig } from "../dist/types.js";

import dotenv from "dotenv";
dotenv.config();

/**
 * GraphJin MCP Server Example — with deferred tool loading
 *
 * This example demonstrates deferred tool loading: when an agent has many
 * MCP tools, only core tools + a search_tools meta-function are visible
 * to the LLM. The LLM discovers and activates deferred tools on demand.
 *
 * Setup:
 * 1. Install GraphJin: npm install -g graphjin
 * 2. Start GraphJin demo server: graphjin serve --demo --path /path/to/graphjin/examples/webshop
 * 3. GraphJin will start on http://localhost:8080
 * 4. The MCP proxy connects to it via stdio
 */

// Define the crew configuration
const config = {
  crew: [
    {
      name: "DatabaseAgent",
      description: "An agent with direct database access via GraphJin. Can explore database schema, query tables, list save and run workflows in the builtin JS sandbox etc.",
      definition: `You are a database agent with direct access to a GraphJin database server.
You have resource docs available that describe the GraphJin query DSL, mutation syntax, workflow guides, and JS runtime API. Read them to understand how GraphJin works — its DSL differs from standard GraphQL.
You can discover additional action tools via search_tools.
If a query fails, do not retry the same query — use fix_query_error or re-check the schema instead.`,
      signature: 'question:string "a natural language question about the database" -> answer:string "the answer to the question"',
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-sonnet-4-6",
        temperature: 0,
        stream: false
      },
      options: {
        debug: true
      },
      mcpServers: {
        "graphjin": {
          "command": "graphjin",
          "args": ["mcp", "--server", "http://localhost:8080"]
        }
      },
      // Force deferred mode with a low threshold for testing
      // (GraphJin exposes ~30 tools, but this ensures it activates even with fewer)
      deferredTools: {
        enabled: true,
        threshold: 5,
      },
    },
    {
      name: "ManagerAgent",
      description: "Orchestrates database queries and analysis tasks",
      definition: `You are an orchestrator that routes questions to specialized agents.
Delegate each question to the most relevant agent in a SINGLE call — do not break questions into sub-queries.
The sub-agent will handle all the steps internally. Your job is to route and synthesize, not to decompose.
If multiple agents are needed, call them and combine their answers.`,
      signature: 'question:string "a question to be answered" -> answer:string "the answer to the question"',
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-sonnet-4-6",
        maxTokens: 2000,
        temperature: 0,
        stream: false
      },
      options: {
        debug: false,
      },
      agents: ["DatabaseAgent"]
    }
  ],
};

// Create a new instance of AxCrew with the config
const crew = new AxCrew(config as AxCrewConfig);

const userQuery = "which products had the most refund requests and why?";

console.log(`\nQuestion: ${userQuery}`);

const main = async (): Promise<void> => {
  try {
    await crew.addAllAgents();

    const managerAgent = crew.agents?.get("ManagerAgent");
    const databaseAgent = crew.agents?.get("DatabaseAgent");

    // Log the initial tool set for DatabaseAgent
    const allFns = (databaseAgent as any)?.axGenProgram?.functions?.map((f: any) => f.name);
    console.log(`\n--- DatabaseAgent initial tools (${allFns?.length ?? 0}) ---`);
    console.log(allFns);

    // Check if deferred mode is active
    const dm = (databaseAgent as any)?.deferredToolManager;
    console.log(`\nDeferred mode active: ${dm?.isActive ?? false}`);

    if (!managerAgent) {
      throw new Error("Failed to initialize ManagerAgent");
    }

    console.log("\n--- Starting query (watch for search_tools calls) ---\n");

    const managerResponse = await managerAgent.forward({
      question: userQuery,
    });

    console.log(`\nAnswer: ${JSON.stringify(managerResponse?.answer, null, 2)}`);

    // Log final tool set to see what was activated
    const finalFns = (databaseAgent as any)?.axGenProgram?.functions?.map((f: any) => f.name);
    console.log(`\n--- DatabaseAgent final tools (${finalFns?.length ?? 0}) ---`);
    console.log(finalFns);

    // Show which tools were activated via search
    if (allFns && finalFns) {
      const activated = finalFns.filter((n: string) => !allFns.includes(n));
      if (activated.length > 0) {
        console.log(`\nTools activated via search_tools: ${activated.join(', ')}`);
      }
    }

    // Print metrics
    console.log("\nMetrics:\n+++++++++++++++++++++++++++++++++");
    console.log("Crew Metrics:", JSON.stringify((crew as any)?.getCrewMetrics?.(), null, 2));
  } catch (error) {
    console.error("\nError:", error);
    console.error("\nTroubleshooting:");
    console.error("1. Make sure GraphJin is running: graphjin serve --demo --path /path/to/graphjin/examples/webshop");
    console.error("2. Check that GraphJin is accessible at http://localhost:8080");
    console.error("3. Verify graphjin is installed: which graphjin");
    throw error;
  } finally {
    crew.destroy();
  }
};

main()
  .then(() => {
    console.log("\nDone");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(1);
  });
