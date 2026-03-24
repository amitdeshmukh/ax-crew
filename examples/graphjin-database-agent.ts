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
      definition: `You are a database agent with access to GraphJin tools. Follow this workflow:
1. Use search_tools to discover available tools for your task.
2. Use list_tables and describe_table to understand the schema BEFORE writing queries.
3. Use get_query_syntax to learn the GraphJin DSL (it differs from standard GraphQL).
4. IMPORTANT: If a query fails, NEVER retry the same query. Instead:
   - Call fix_query_error with the failed query and error message to get repair guidance.
   - Or call describe_table to re-check the schema.
   - Or call get_query_syntax to review the correct syntax.
5. Return the final result once you have the data.`,
      signature: 'dbQuery:string "a database question or query request" -> dbResult:string "the query result or answer"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-pro-latest",
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
      definition: `You are a manager agent that helps users get insights from databases.
Delegate to DatabaseAgent for all database operations. Break complex questions into
simple, specific sub-queries. Synthesize the results into a clear final answer.`,
      signature: 'question:string "a question to be answered" -> answer:string "the answer to the question"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-flash-latest",
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

const userQuery = "What are the different types of support tickets and how many of each type exist?";

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
