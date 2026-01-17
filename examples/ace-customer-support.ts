/**
 * ACE Feedback Loop Demo - Customer Support Agent
 * 
 * This example demonstrates ACE learning from human feedback.
 * 
 * ═══════════════════════════════════════════════════════════════════
 * THE CHALLENGE: 3 Strict Policies vs Real-World Edge Cases
 * ═══════════════════════════════════════════════════════════════════
 * 
 * The agent knows only 3 simple rules:
 *   1. Returns within 30 days only
 *   2. Refunds to original payment method only  
 *   3. Sale items: no returns, no refunds
 * 
 * But every scenario presented violates at least one policy!
 * Watch how the agent handles these impossible situations,
 * then teach it when exceptions should apply.
 * 
 * ACE learns your feedback and applies it to similar future cases.
 * 
 * ═══════════════════════════════════════════════════════════════════
 * 
 * Usage: npx tsx examples/ace-customer-support.ts
 */

import { AxCrew } from "../dist/index.js";
import { AxCrewFunctions } from "../dist/functions/index.js";
import type { AxCrewConfig } from "../dist/types.js";
import type { Provider } from "../dist/types.js";
import * as readline from "readline";
import dotenv from "dotenv";
dotenv.config();

// --- 1. Configuration ---

const STANDARD_POLICIES = [
  "Returns: Only accepted within 30 days of delivery",
  "Refunds: Must go to the original payment method used",
  "Sale Items: Final sale - absolutely no returns or refunds"
];

const crewConfig: AxCrewConfig = {
  crew: [
    {
      name: "SupportAgent",
      description: `You are a customer support agent for TechMart, an e-commerce electronics retailer. Strictly follow the company policies. No exceptions.`,
      signature: "ticket:string, standardPolicies:string[] -> politeSupportResponse:string, decision:string, policyApplied:string",
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
      // Enable ACE for learning from edge case feedback
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
          playbookPath: "playbooks/customer-support.json", 
          autoPersist: true 
        },
        metric: { primaryOutputField: "politeSupportResponse" },
        compileOnStart: false,
      }
    }
  ]
};

// --- 2. Sample Support Tickets ---

// Each ticket violates at least one of the 3 policies - perfect for teaching exceptions
const SAMPLE_TICKETS = [
  {
    id: "T-001",
    category: "🚫 Violates: 30-day return policy",
    ticket: `Customer: Sarah Mitchell (8-year Gold Member, $15,000+ purchases)
Purchase: Laptop, 45 days ago (unopened, still sealed)
Request: Full refund
Reason: Was hospitalized for 3 weeks after purchase`
  },
  {
    id: "T-002", 
    category: "🚫 Violates: Original payment method",
    ticket: `Customer: James Chen
Purchase: Headphones, returned within 30 days
Request: Refund to a DIFFERENT card (not the original)
Reason: Original card was stolen. Has police report.`
  },
  {
    id: "T-003",
    category: "🚫 Violates: No refunds on sale items",
    ticket: `Customer: Maria Garcia (12-year Platinum Member)
Purchase: TV during Black Friday sale
Request: Full refund
Reason: Dead on arrival - won't power on. Factory defect.`
  },
  {
    id: "T-004",
    category: "🚫 Violates: 30-day return policy",
    ticket: `Customer: David Park
Purchase: Monitor, 35 days ago
Request: Replacement
Reason: Arrived damaged (shipping damage). Photos confirm. 
Couldn't report earlier due to family funeral.`
  },
  {
    id: "T-005",
    category: "🚫 Violates: No refunds on sale items",
    ticket: `Customer: Emily Watson
Purchase: Earbuds (bought on clearance sale)
Request: Store credit
Reason: Allergic reaction to ear tips (medical issue).
Item unused, original packaging.`
  },
  {
    id: "T-006",
    category: "🚫 Violates: 30-day return policy",
    ticket: `Customer: Robert Taylor (First-time customer)
Purchase: Gaming keyboard, 60 days ago
Request: Refund or replacement
Reason: Keys started failing after 2 weeks of normal use.
Product defect, documented with video.`
  },
  {
    id: "T-007",
    category: "🚫 Violates: Original payment method",
    ticket: `Customer: Lisa Anderson (5-year Gold Member)  
Purchase: Smart watch, wants refund
Request: Refund to PayPal (paid with credit card)
Reason: Bank closed her credit card account. 
Card no longer exists.`
  }
];

// --- 3. CLI Helper Functions ---

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
  console.log("─".repeat(70));
  
  if (!playbook) {
    console.log("  (No learned exceptions yet - standard policies apply)");
    console.log("─".repeat(70));
    return;
  }
  
  if (playbook.sections) {
    for (const [sectionName, bullets] of Object.entries(playbook.sections)) {
      console.log(`\n  📂 ${sectionName}:`);
      if (Array.isArray(bullets)) {
        bullets.forEach((bullet: any, i: number) => {
          const content = typeof bullet === 'string' ? bullet : bullet.content || JSON.stringify(bullet);
          // Wrap long lines
          const wrapped = content.length > 60 
            ? content.match(/.{1,60}(\s|$)/g)?.join('\n        ') || content
            : content;
          console.log(`     ${i + 1}. ${wrapped}`);
        });
      }
    }
  } else {
    console.log("  " + JSON.stringify(playbook, null, 2).replace(/\n/g, "\n  "));
  }
  
  if (playbook.updatedAt) {
    console.log(`\n  🕐 Last updated: ${new Date(playbook.updatedAt).toLocaleString()}`);
  }
  
  console.log("─".repeat(70));
};

const displayTicket = (ticket: typeof SAMPLE_TICKETS[0]) => {
  console.log(`\n┌${"─".repeat(68)}┐`);
  console.log(`│ 🎫 Ticket ${ticket.id.padEnd(56)}│`);
  console.log(`│ Category: ${ticket.category.padEnd(55)}│`);
  console.log(`├${"─".repeat(68)}┤`);
  
  // Split ticket into lines that fit
  const lines = ticket.ticket.split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.length <= 66) {
      console.log(`│ ${trimmed.padEnd(66)}│`);
    } else {
      // Wrap long lines
      const words = trimmed.split(' ');
      let currentLine = '';
      words.forEach(word => {
        if ((currentLine + ' ' + word).trim().length <= 66) {
          currentLine = (currentLine + ' ' + word).trim();
        } else {
          if (currentLine) console.log(`│ ${currentLine.padEnd(66)}│`);
          currentLine = word;
        }
      });
      if (currentLine) console.log(`│ ${currentLine.padEnd(66)}│`);
    }
  });
  
  console.log(`└${"─".repeat(68)}┘`);
};

const displayResponse = (result: any) => {
  console.log(`\n╔${"═".repeat(68)}╗`);
  console.log(`║ 💬 Agent Response${" ".repeat(50)}║`);
  console.log(`╠${"═".repeat(68)}╣`);
  
  // Display decision
  console.log(`║ 📋 Decision: ${(result.decision || "N/A").substring(0, 52).padEnd(53)}║`);
  console.log(`║ 📖 Policy: ${(result.policyApplied || "N/A").substring(0, 54).padEnd(55)}║`);
  console.log(`╠${"═".repeat(68)}╣`);
  
  // Display response (wrapped)
  const responseLines = (result.politeSupportResponse || "").split('\n');
  responseLines.forEach((line: string) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      console.log(`║ ${" ".repeat(66)}║`);
    } else if (trimmed.length <= 66) {
      console.log(`║ ${trimmed.padEnd(66)}║`);
    } else {
      const words = trimmed.split(' ');
      let currentLine = '';
      words.forEach(word => {
        if ((currentLine + ' ' + word).trim().length <= 66) {
          currentLine = (currentLine + ' ' + word).trim();
        } else {
          if (currentLine) console.log(`║ ${currentLine.padEnd(66)}║`);
          currentLine = word;
        }
      });
      if (currentLine) console.log(`║ ${currentLine.padEnd(66)}║`);
    }
  });
  
  console.log(`╚${"═".repeat(68)}╝`);
};

const displayHelp = () => {
  console.log("\n📋 Commands:");
  console.log("   • [1-7]     - Select a sample ticket by number");
  console.log("   • custom    - Enter a custom support ticket");
  console.log("   • playbook  - View learned exceptions");
  console.log("   • policies  - Show the 3 strict rules");
  console.log("   • help      - Show this help message");
  console.log("   • quit      - Exit the demo");
  
  console.log("\n📝 Example feedback to teach exceptions:");
  console.log("   • \"Medical emergencies extend the 30-day window to 60 days\"");
  console.log("   • \"Allow alternate payment if original method is closed/stolen\"");
  console.log("   • \"Defective products get refunded regardless of sale status\"");
  console.log("   • \"Loyal customers (5+ years) get extended return windows\"");
};

const displayPolicies = () => {
  console.log("\n📜 The Only 3 Rules the Agent Knows:");
  console.log("═".repeat(70));
  STANDARD_POLICIES.forEach((policy, i) => console.log(`  ${i + 1}. ${policy}`));
  console.log("═".repeat(70));
  console.log("\n⚠️  Every sample ticket VIOLATES at least one of these rules!");
  console.log("   Watch how the agent decides, then teach it when to make exceptions.");
};

// --- 4. Main Interactive Loop ---

async function main() {
  console.log("\n🎧 ACE Customer Support Demo: 3 Rules vs Reality");
  console.log("═".repeat(70));
  console.log("The agent knows only 3 strict policies. Every ticket violates one.");
  console.log("Watch it struggle, then teach it when exceptions should apply.\n");

  // Initialize AxCrew
  const crew = new AxCrew(crewConfig, AxCrewFunctions);

  try {
    console.log("⏳ Initializing Support Agent...");
    await crew.addAgentsToCrew(["SupportAgent"]);
    const agent = crew.agents!.get("SupportAgent")!;

    console.log("✅ Support Agent ready with ACE enabled\n");

    // Show initial playbook (if loaded from persistence)
    const initialPlaybook = (agent as any).getPlaybook?.();
    displayPlaybook(initialPlaybook, "SupportAgent");

    displayHelp();

    let continueLoop = true;
    let ticketCount = 0;
    let feedbackCount = 0;

    while (continueLoop) {
      console.log(`\n${"═".repeat(70)}`);
      console.log(`🎧 Support Session #${ticketCount + 1}`);
      console.log("═".repeat(70));

      // List available tickets
      console.log("\n📋 Sample Tickets:");
      SAMPLE_TICKETS.forEach((t, i) => {
        console.log(`   [${i + 1}] ${t.id}: ${t.category}`);
      });

      const choice = await prompt("\n🔍 Select ticket [1-7], 'custom', 'playbook', 'policies', 'help', or 'quit': ");
      
      if (choice.toLowerCase() === 'quit' || choice.toLowerCase() === 'exit' || choice === '') {
        continueLoop = false;
        continue;
      }

      if (choice.toLowerCase() === 'help') {
        displayHelp();
        continue;
      }

      if (choice.toLowerCase() === 'playbook') {
        const currentPlaybook = (agent as any).getPlaybook?.();
        displayPlaybook(currentPlaybook, "SupportAgent");
        continue;
      }

      if (choice.toLowerCase() === 'policies') {
        displayPolicies();
        continue;
      }

      let ticketText: string;
      let ticketDisplay: typeof SAMPLE_TICKETS[0] | null = null;

      if (choice.toLowerCase() === 'custom') {
        console.log("\n📝 Enter custom ticket details (press Enter twice when done):");
        let lines: string[] = [];
        let line = await prompt("   ");
        while (line !== '') {
          lines.push(line);
          line = await prompt("   ");
        }
        ticketText = lines.join('\n');
        if (!ticketText.trim()) {
          console.log("❌ Empty ticket, please try again.");
          continue;
        }
      } else {
        const ticketNum = parseInt(choice);
        if (isNaN(ticketNum) || ticketNum < 1 || ticketNum > SAMPLE_TICKETS.length) {
          console.log("❌ Invalid selection. Enter 1-7, 'custom', 'playbook', 'policies', 'help', or 'quit'.");
          continue;
        }
        ticketDisplay = SAMPLE_TICKETS[ticketNum - 1];
        ticketText = ticketDisplay.ticket;
      }

      ticketCount++;

      // Display the ticket
      if (ticketDisplay) {
        displayTicket(ticketDisplay);
      } else {
        console.log("\n📝 Custom Ticket:");
        console.log("─".repeat(70));
        console.log(ticketText);
        console.log("─".repeat(70));
      }

      console.log("\n⏳ Agent processing ticket...\n");

      try {
        // Execute the query
        const result = await agent.forward({ ticket: ticketText, standardPolicies: STANDARD_POLICIES });
        const taskId = (result as any)._taskId;

        displayResponse(result);

        // Get feedback from user
        console.log("\n💬 Supervisor Feedback Loop");
        console.log("─".repeat(70));
        console.log("Was this response correct? If not, provide feedback to teach the agent");
        console.log("how to handle this type of edge case in the future.\n");
        
        const feedback = await prompt("📝 Feedback (or Enter to approve): ");

        if (feedback.toLowerCase() === 'quit' || feedback.toLowerCase() === 'exit') {
          continueLoop = false;
          continue;
        }

        if (feedback && feedback.length > 0) {
          console.log("\n⏳ Teaching agent new exception handling...");

          // Apply feedback via ACE
          if (taskId) {
            await crew.applyTaskFeedback({
              taskId,
              feedback,
              strategy: "all"
            });
          } else {
            await (agent as any).applyOnlineUpdate?.({
              example: { ticket: ticketText },
              prediction: result,
              feedback
            });
          }

          feedbackCount++;
          console.log("✅ Agent learned from feedback!\n");

          // Display updated playbook
          const updatedPlaybook = (agent as any).getPlaybook?.();
          displayPlaybook(updatedPlaybook, "SupportAgent");

          console.log("\n💡 The agent will now apply this learning to similar situations!");
          console.log("   Try another ticket to see the agent use this new knowledge.");
        } else {
          console.log("\n✅ Response approved - no changes needed.");
        }

      } catch (error: any) {
        console.error(`\n❌ Error: ${error.message}`);
      }
    }

    // Final summary
    console.log("\n" + "═".repeat(70));
    console.log("📊 Session Summary");
    console.log("═".repeat(70));
    console.log(`   Tickets handled: ${ticketCount}`);
    console.log(`   Feedback provided: ${feedbackCount}`);
    
    const finalPlaybook = (agent as any).getPlaybook?.();
    if (finalPlaybook?.sections) {
      const bulletCount = Object.values(finalPlaybook.sections)
        .reduce((acc: number, bullets: any) => acc + (Array.isArray(bullets) ? bullets.length : 0), 0);
      console.log(`   Learned exceptions: ${bulletCount}`);
    }
    console.log(`   Saved to: playbooks/customer-support.json`);

    console.log("\n🎧 Thanks for training the Support Agent!");
    console.log("   Learned exceptions are saved for future sessions.\n");

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.log("\nTroubleshooting:");
    console.log("• Ensure GEMINI_API_KEY (or OPENAI_API_KEY) is set");
  } finally {
    crew.cleanupOldExecutions(60000);
    crew.destroy();
    rl.close();
  }
}

// --- 5. Run ---

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
