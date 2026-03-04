import { AxCrew } from "../dist/index.js";
import type { AxCrewConfig } from "../dist/types.js";

import dotenv from "dotenv";
dotenv.config();

/**
 * GraphJin MCP Server Example
 *
 * This example demonstrates how to use GraphJin as an MCP server to give AI agents
 * direct access to databases. GraphJin auto-discovers your database schema and provides
 * tools for querying, schema exploration, and more.
 *
 * Setup:
 * 1. Install GraphJin: npm install -g graphjin
 * 2. Start GraphJin demo server: graphjin serve --demo --path /path/to/graphjin/examples/webshop
 * 3. GraphJin will start on http://localhost:8080
 * 4. The MCP proxy connects to it via stdio
 *
 * Alternative setup (direct mode):
 * If you have a GraphJin config, you can use direct mode without a running server:
 * - Use command: "graphjin" with args: ["mcp", "--demo", "--path", "/path/to/config"]
 *
 * Note: There is currently a schema validation issue between GraphJin and Ax.
 * GraphJin's array parameters don't include "items" definitions in their JSON Schema,
 * which Ax requires per JSON Schema spec. A fix is needed in either:
 * - GraphJin's mcp-go integration (recommended)
 * - Or Ax's schema validation (less recommended)
 */

// Define the crew configuration
const config = {
  crew: [
    {
      name: "DatabaseAgent",
      description: "An agent with direct database access via GraphJin. Can query products, customers, orders, and explore database schema.",
      signature: 'dbQuery:string "a database question or query request" -> dbResult:string "the query result or answer"',
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
      // MCP Server Configuration for GraphJin
      // This assumes you have graphjin running on http://localhost:8080
      // Start it with: graphjin serve --demo --path /path/to/graphjin/examples/webshop
      mcpServers: {
        "graphjin": {
          "command": "graphjin",
          // Proxy mode: connects to a running GraphJin HTTP server
          "args": ["mcp", "--server", "http://localhost:8080"]

          // Direct mode (alternative - uncomment to use):
          // Runs GraphJin MCP server directly with demo database
          // "args": ["mcp", "--demo", "--path", "/path/to/your/graphjin/config"]
        }
      },
    },
    {
      name: "ManagerAgent",
      description: "Orchestrates database queries and analysis tasks",
      prompt: `You are a manager agent that helps users get insights from databases.
You can delegate to the DatabaseAgent for any database queries or schema exploration.
Keep your responses clear and well-formatted.`,
      signature: 'question:string "a question to be answered" -> answer:string "the answer to the question"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-pro",
        maxTokens: 2000,
        temperature: 0,
        stream: false
      },
      options: {
        debug: true,
      },
      agents: ["DatabaseAgent"]
    }
  ],
};

// Create a new instance of AxCrew with the config
const crew = new AxCrew(config as AxCrewConfig);

// Example queries to try:
const queries = [
  "What tables are available in the database?",
  "Show me the schema for the products table",
  "How many products are in the database?",
  "List the top 5 most expensive products",
  "What customers have placed orders in the last 30 days?"
];

// Use a simpler query for testing
const userQuery: string = queries[0]; // "What tables are available in the database?"

console.log(`\n\nQuestion: ${userQuery}`);

const main = async (): Promise<void> => {
  try {
    // Initialize agents inside main so initialization failures are handled here.
    await crew.addAllAgents();

    const managerAgent = crew.agents?.get("ManagerAgent");
    const databaseAgent = crew.agents?.get("DatabaseAgent");

    if (!managerAgent) {
      throw new Error("Failed to initialize ManagerAgent");
    }

    const managerResponse = await managerAgent.forward({
      question: userQuery,
    });

    console.log(`\nAnswer: ${JSON.stringify(managerResponse?.answer, null, 2)}`);

    // Print metrics
    console.log("\nMetrics:\n+++++++++++++++++++++++++++++++++");
    console.log("Manager Agent Metrics:", JSON.stringify((managerAgent as any)?.getMetrics?.(), null, 2));
    console.log("Database Agent Metrics:", JSON.stringify((databaseAgent as any)?.getMetrics?.(), null, 2));
    console.log("Crew Metrics:", JSON.stringify((crew as any)?.getCrewMetrics?.(), null, 2));
  } catch (error) {
    console.error("\n❌ Error:", error);
    console.error("\nTroubleshooting:");
    console.error("1. Make sure GraphJin is running: graphjin serve --demo --path /path/to/graphjin/examples/webshop");
    console.error("2. Check that GraphJin is accessible at http://localhost:8080");
    console.error("3. Verify graphjin is installed: which graphjin");
    console.error("4. Note: There's a known schema validation issue - see comments in the code");
    throw error;
  } finally {
    crew.destroy();
  }
};

main()
  .then(() => {
    console.log("\n✅ Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
