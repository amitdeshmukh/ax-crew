/**
 * ACE Feedback Loop Demo - Google Flights Assistant
 * 
 * This example demonstrates:
 * - An agent using Google Flights MCP server for real flight searches
 * - ACE learning from user feedback to improve recommendations
 * - Interactive CLI for flight queries
 * - Playbook persistence and display
 * 
 * ═══════════════════════════════════════════════════════════════════
 * SETUP: Google Flights MCP Server
 * ═══════════════════════════════════════════════════════════════════
 * 
 * This example uses the Google Flights MCP Server:
 * https://github.com/opspawn/Google-Flights-MCP-Server
 * 
 * Installation:
 * 
 * 1. Clone the MCP server:
 *    git clone https://github.com/opspawn/Google-Flights-MCP-Server.git
 *    cd Google-Flights-MCP-Server
 * 
 * 2. Create virtual environment and install dependencies:
 *    python -m venv .venv
 *    source .venv/bin/activate  # On Windows: .venv\Scripts\activate
 *    pip install -r requirements.txt
 * 
 * 3. Install Playwright browsers (needed by fast_flights):
 *    playwright install
 * 
 * 4. Set environment variable and run from activated venv:
 *    export GOOGLE_FLIGHTS_SERVER_PATH="/path/to/Google-Flights-MCP-Server/server.py"
 *    # Python is auto-detected from your PATH (uses activated venv)
 * 
 * Available MCP Tools:
 * - get_flights_on_date: One-way flights for a specific date
 * - get_round_trip_flights: Round-trip flights with departure/return dates
 * - find_all_flights_in_range: Find flights within a date range
 * 
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Usage: npx tsx examples/ace-feedback-routing.ts
 */

import { AxCrew } from "../dist/index.js";
import { AxCrewFunctions } from "../dist/functions/index.js";
import type { AxCrewConfig } from "../dist/types.js";
import type { Provider } from "../dist/types.js";
import "dotenv/config";
import * as readline from "readline";

// --- 1. Configuration ---

// Google Flights MCP Server paths - set via env vars
// See: https://github.com/opspawn/Google-Flights-MCP-Server
const GOOGLE_FLIGHTS_SERVER = process.env.GOOGLE_FLIGHTS_SERVER_PATH 
  || "/path/to/Google-Flights-MCP-Server/server.py";
// Uses system python by default - activate your venv before running!
const GOOGLE_FLIGHTS_PYTHON = process.env.PYTHON_PATH || "python";

const crewConfig: AxCrewConfig = {
  crew: [
    {
      name: "FlightAssistant",
      description: `A helpful flight booking assistant that searches Google Flights and provides recommendations.`,
      signature: "query:string -> recommendation:string",
      provider: "google-gemini" as Provider,
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-flash-latest",
        temperature: 0.7,
      },
      options: {
        debug: false,
        stream: false
      },
      // Google Flights MCP Server - see https://github.com/opspawn/Google-Flights-MCP-Server
      mcpServers: {
        "google-flights": {
          command: GOOGLE_FLIGHTS_PYTHON,
          args: [GOOGLE_FLIGHTS_SERVER],
          env: {}
        }
      },
      // Enable ACE for learning from feedback
      ace: {
        teacher: {
          provider: "google-gemini" as Provider,
          providerKeyName: "GEMINI_API_KEY",
          ai: { model: "gemini-flash-latest" }
        },
        options: { 
          maxEpochs: 1, 
          allowDynamicSections: true 
        },
        persistence: { 
          playbookPath: "playbooks/flight-assistant.json", 
          autoPersist: true 
        },
        metric: { primaryOutputField: "recommendation" },
        compileOnStart: false,
      }
    }
  ]
};

// --- 2. CLI Helper Functions ---

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const prompt = (question: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
};

const displayPlaybook = (playbook: any, agentName: string) => {
  console.log(`\n📘 ACE Playbook for ${agentName}:`);
  console.log("─".repeat(60));
  
  if (!playbook) {
    console.log("  (No playbook yet - will be created after first feedback)");
    console.log("─".repeat(60));
    return;
  }
  
  if (playbook.sections) {
    for (const [sectionName, bullets] of Object.entries(playbook.sections)) {
      console.log(`\n  📂 ${sectionName}:`);
      if (Array.isArray(bullets)) {
        bullets.forEach((bullet: any, i: number) => {
          const content = typeof bullet === 'string' ? bullet : bullet.content || JSON.stringify(bullet);
          console.log(`     ${i + 1}. ${content}`);
        });
      }
    }
  } else {
    console.log("  " + JSON.stringify(playbook, null, 2).replace(/\n/g, "\n  "));
  }
  
  if (playbook.updatedAt) {
    console.log(`  🕐 Last updated: ${new Date(playbook.updatedAt).toLocaleString()}`);
  }
  
  console.log("─".repeat(60));
};

const displayHelp = () => {
  console.log("\n📋 Example flight queries:");
  console.log("   • Find flights from JFK to LAX on 2025-02-15");
  console.log("   • Round trip from SFO to LHR, leaving 2025-03-01 returning 2025-03-10");
  console.log("   • Cheapest flights from NYC to Tokyo in March 2025");
  console.log("\n📝 Feedback examples to train the assistant:");
  console.log("   • Always show price in USD");
  console.log("   • Prioritize direct flights");
  console.log("   • Include flight duration");
};

// --- 3. Main Interactive Loop ---

async function main() {
  console.log("\n✈️  ACE Flight Assistant - Google Flights Edition");
  console.log("═".repeat(60));
  console.log("Search real flights and train the assistant with feedback.");
  console.log("MCP Server: https://github.com/opspawn/Google-Flights-MCP-Server\n");

  // Check configuration
  const isConfigured = !GOOGLE_FLIGHTS_SERVER.includes("/path/to/");
  if (!isConfigured) {
    console.log("⚠️  MCP Server not configured!");
    console.log("   1. Clone: git clone https://github.com/opspawn/Google-Flights-MCP-Server.git");
    console.log("   2. Setup: cd Google-Flights-MCP-Server && python -m venv .venv");
    console.log("   3. Activate: source .venv/bin/activate");
    console.log("   4. Install: pip install -r requirements.txt && playwright install");
    console.log("   5. Export: export GOOGLE_FLIGHTS_SERVER_PATH=/path/to/server.py");
    console.log("\n   Demo will continue but flight lookups won't work.\n");
  }

  // Initialize AxCrew
  const crew = new AxCrew(crewConfig, AxCrewFunctions);

  try {
    console.log("⏳ Initializing Flight Assistant...");
    await crew.addAgentsToCrew(["FlightAssistant"]);
    const assistant = crew.agents!.get("FlightAssistant")!;

    console.log("✅ Flight Assistant ready with ACE enabled");
    if (isConfigured) {
      console.log("✅ Google Flights MCP server connected\n");
    }

    // Show initial playbook (if loaded from persistence)
    const initialPlaybook = (assistant as any).getPlaybook?.();
    displayPlaybook(initialPlaybook, "FlightAssistant");

    displayHelp();

    let continueLoop = true;
    let queryCount = 0;
    let feedbackCount = 0;

    while (continueLoop) {
      console.log(`\n${"═".repeat(60)}`);
      console.log(`✈️  Search #${queryCount + 1}`);
      console.log("═".repeat(60));

      // Get flight query from user
      const query = await prompt("\n🔍 Flight query (or 'help'/'quit'): ");
      
      if (query.toLowerCase() === 'quit' || query.toLowerCase() === 'exit' || query === '') {
        continueLoop = false;
        continue;
      }

      if (query.toLowerCase() === 'help') {
        displayHelp();
        continue;
      }

      if (query.toLowerCase() === 'playbook') {
        const currentPlaybook = (assistant as any).getPlaybook?.();
        displayPlaybook(currentPlaybook, "FlightAssistant");
        continue;
      }

      queryCount++;
      console.log("\n⏳ Searching Google Flights...\n");

      try {
        // Execute the query
        const result = await assistant.forward({ query });
        const taskId = (result as any)._taskId;

        console.log("─".repeat(60));
        console.log("🛫 Flight Results:");
        console.log("─".repeat(60));
        console.log(result.recommendation);
        console.log("─".repeat(60));

        // Get feedback from user
        console.log("\n💬 Train the assistant (Enter feedback or press Enter to skip):");
        
        const feedback = await prompt("📝 Feedback: ");

        if (feedback.toLowerCase() === 'quit' || feedback.toLowerCase() === 'exit') {
          continueLoop = false;
          continue;
        }

        if (feedback && feedback.length > 0) {
          console.log("\n⏳ Updating ACE playbook...");

          // Apply feedback via ACE
          if (taskId) {
            await crew.applyTaskFeedback({
              taskId,
              feedback,
              strategy: "all"
            });
          } else {
            await (assistant as any).applyOnlineUpdate?.({
              example: { query },
              prediction: result,
              feedback
            });
          }

          feedbackCount++;
          console.log("✅ Playbook updated!\n");

          // Display updated playbook
          const updatedPlaybook = (assistant as any).getPlaybook?.();
          displayPlaybook(updatedPlaybook, "FlightAssistant");

          console.log("\n💡 The assistant has learned from your feedback!");
        } else {
          console.log("\n⏭️  Skipped feedback.");
        }

      } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}`);
        if (error.message.includes("MCP") || error.message.includes("transport")) {
          console.log("   Check MCP server configuration.");
          console.log("   See: https://github.com/opspawn/Google-Flights-MCP-Server");
        }
      }
    }

    // Final summary
    console.log("\n" + "═".repeat(60));
    console.log("📊 Session Summary");
    console.log("═".repeat(60));
    console.log(`   Searches: ${queryCount}`);
    console.log(`   Feedback given: ${feedbackCount}`);
    
    const finalPlaybook = (assistant as any).getPlaybook?.();
    if (finalPlaybook?.sections) {
      const bulletCount = Object.values(finalPlaybook.sections)
        .reduce((acc: number, bullets: any) => acc + (Array.isArray(bullets) ? bullets.length : 0), 0);
      console.log(`   Playbook insights: ${bulletCount}`);
    }
    console.log(`   Saved to: playbooks/flight-assistant.json`);

    console.log("\n✈️  Thanks for using ACE Flight Assistant!");
    console.log("   Your preferences are saved for next time.\n");

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.log("\nTroubleshooting:");
    console.log("• Ensure OPENAI_API_KEY is set");
    console.log("• For MCP: https://github.com/opspawn/Google-Flights-MCP-Server");
  } finally {
    crew.cleanupOldExecutions(60000);
    crew.destroy();
    rl.close();
  }
}

// --- 4. Run ---

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
