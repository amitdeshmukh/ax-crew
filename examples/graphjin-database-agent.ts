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
      definition: `You answer questions by querying databases via a GraphJin server.
You have resource docs available (query syntax, mutation syntax, workflow guides, JS runtime API). Read them to learn the GraphJin DSL — it differs from standard GraphQL.
Use search_tools to discover additional action tools not shown by default.

STRATEGY:
1. Check first — call list_workflows and list_saved_queries. If a match exists, execute it and skip to step 5.

2. Learn the environment:
   a. Read resource docs (get_query_syntax, get_js_runtime_api) to understand the DSL and runtime API.
   b. Call list_tables + describe_table for schema details. Use explore_relationships or find_path if joins are needed.

3. Build and validate:
   a. Author a JavaScript workflow using gj.tools.* for server-side computation. Design it with input variables — never hardcode values.
   b. Call execute_graphql first to validate query shape and results before embedding in a workflow.

4. Save and run — call save_workflow with a descriptive snake_case name and tags, then execute_workflow.

5. If a query fails, do not retry the same query. Call fix_query_error or explain_query to diagnose, then fix and re-save.

6. Synthesize the answer from results.`,
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

const userQuery = "Which employees have the most leave requests and how does that correlate with their performance review scores? Show the top 10.";

console.log(`\nQuestion: ${userQuery}`);

const main = async (): Promise<void> => {
  const timers: Record<string, number> = {};

  try {
    // --- Setup phase ---
    const t0 = performance.now();
    await crew.addAllAgents();
    timers["setup"] = performance.now() - t0;

    const managerAgent = crew.agents?.get("ManagerAgent");

    if (!managerAgent) {
      throw new Error("Failed to initialize ManagerAgent");
    }

    // --- Query phase ---
    console.log("\n--- Starting query ---\n");
    const t1 = performance.now();

    const managerResponse = await managerAgent.forward({
      question: userQuery,
    });

    timers["query"] = performance.now() - t1;
    timers["total"] = performance.now() - t0;

    // --- Results ---
    console.log(`\nAnswer: ${JSON.stringify(managerResponse?.answer, null, 2)}`);

    // --- Timing & Metrics ---
    console.log("\n--- Performance ---");
    console.log(`  Setup:  ${(timers["setup"]! / 1000).toFixed(2)}s`);
    console.log(`  Query:  ${(timers["query"]! / 1000).toFixed(2)}s`);
    console.log(`  Total:  ${(timers["total"]! / 1000).toFixed(2)}s`);

    console.log("\n--- Metrics ---");
    console.log(JSON.stringify((crew as any)?.getCrewMetrics?.(), null, 2));
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
