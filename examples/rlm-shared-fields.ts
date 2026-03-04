import dotenv from "dotenv";
import { AxJSRuntime, AxJSRuntimePermission } from "@ax-llm/ax";
import { AxCrew } from "../dist/index.js";
import type { AxCrewConfig } from "../dist/index.js";

dotenv.config();

const runtime = new AxJSRuntime({
  permissions: [AxJSRuntimePermission.TIMING],
});

const config: AxCrewConfig = {
  crew: [
    {
      name: "PolicyLookupAgent",
      description: "Looks up policy details in the provided knowledge base.",
      executionMode: "axagent",
      signature:
        'question:string -> answer:string "Looks up company policies and returns a concise answer"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-flash",
        temperature: 0,
      },
      axAgentOptions: {
        // Mandatory for AxAgent RLM mode (even if empty)
        contextFields: [],
        runtime,
      },
    },
    {
      name: "BillingHelperAgent",
      description: "Answers billing and account questions.",
      executionMode: "axagent",
      signature:
        'question:string -> answer:string "Resolves billing and account questions"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-flash",
        temperature: 0,
      },
      axAgentOptions: {
        contextFields: [],
        runtime,
      },
    },
    {
      name: "SentimentClassifierAgent",
      description: "Classifies customer message sentiment.",
      executionMode: "axagent",
      signature: 'question:string -> sentiment:string "positive, negative, or neutral"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-flash",
        temperature: 0,
      },
      axAgentOptions: {
        contextFields: [],
        // Opt out of parent shared fields for this specialist.
        fields: { excluded: ["knowledgeBase", "userId"] },
        runtime,
      },
    },
    {
      name: "CustomerSupportAgent",
      description: "Routes queries to specialists and returns a final answer.",
      executionMode: "axagent",
      signature: "query:string, knowledgeBase:string, userId:string -> answer:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.5-flash",
        temperature: 0,
      },
      agents: [
        "PolicyLookupAgent",
        "BillingHelperAgent",
        "SentimentClassifierAgent",
      ],
      options: {
        debug: true,
      },
      axAgentOptions: {
        // Mandatory and central to shared-field example
        contextFields: ["knowledgeBase"],
        fields: { shared: ["knowledgeBase", "userId"] },
        runtime,
      },
    },
  ],
};

const knowledgeBase = `
=== COMPANY POLICIES ===

REFUND POLICY:
- Full refund within 30 days of purchase for unused items.
- Partial refund (50%) for items returned between 31-60 days.
- No refunds after 60 days.
- Digital products are non-refundable after download.

SHIPPING POLICY:
- Standard shipping: 5-7 business days, free for orders over $50.
- Express shipping: 2-3 business days, $12.99 flat rate.
- International shipping: 10-15 business days, varies by destination.

LOYALTY PROGRAM:
- Bronze tier: 0-499 points - 5% discount on all orders.
- Silver tier: 500-1499 points - 10% discount + free standard shipping.
- Gold tier: 1500+ points - 15% discount + free express shipping + early access to sales.
- Points earned: $1 spent = 1 point.

=== ACCOUNT DATA (userId: cust-42) ===

Name: Alice Johnson
Tier: Silver (720 points)
Recent Orders:
  - Order #A100: Widget Pro, purchased 12 days ago, $89.99, delivered
  - Order #A101: Smart Lamp, purchased 45 days ago, $34.50, delivered
  - Order #A102: USB-C Hub, purchased 3 days ago, $24.99, shipped
Payment Method: Visa ending in 4242
`.trim();

const main = async (): Promise<void> => {
  const crew = new AxCrew(config);
  try {
    await crew.addAllAgents();

    const supportAgent = crew.agents?.get("CustomerSupportAgent");
    if (!supportAgent) throw new Error("Failed to initialize CustomerSupportAgent");

    const result = await supportAgent.forward({
      query:
        "I want to return the Smart Lamp from order #A101. Am I eligible for a full refund? " +
        "Also, how many more points do I need to reach Gold tier?",
      knowledgeBase,
      userId: "cust-42",
    });

    console.log("\n=== Support Answer ===");
    console.log(result.answer);

    const supportMetrics = (supportAgent as any).getMetrics?.();
    const policyMetrics = (crew.agents?.get("PolicyLookupAgent") as any)?.getMetrics?.();
    const billingMetrics = (crew.agents?.get("BillingHelperAgent") as any)?.getMetrics?.();
    const sentimentMetrics = (crew.agents?.get("SentimentClassifierAgent") as any)?.getMetrics?.();
    const crewMetrics = crew.getCrewMetrics();

    console.log("\n=== Cost & Usage (Agents) ===");
    console.log(
      `CustomerSupportAgent USD=${supportMetrics?.estimatedCostUSD ?? 0}, tokens=${supportMetrics?.tokens?.totalTokens ?? 0}`
    );
    console.log(
      `PolicyLookupAgent USD=${policyMetrics?.estimatedCostUSD ?? 0}, tokens=${policyMetrics?.tokens?.totalTokens ?? 0}`
    );
    console.log(
      `BillingHelperAgent USD=${billingMetrics?.estimatedCostUSD ?? 0}, tokens=${billingMetrics?.tokens?.totalTokens ?? 0}`
    );
    console.log(
      `SentimentClassifierAgent USD=${sentimentMetrics?.estimatedCostUSD ?? 0}, tokens=${sentimentMetrics?.tokens?.totalTokens ?? 0}`
    );

    console.log("\n=== Cost & Usage (Crew) ===");
    console.log(`Estimated USD: ${crewMetrics?.estimatedCostUSD ?? 0}`);
    console.log(
      `Tokens: prompt=${crewMetrics?.tokens?.promptTokens ?? 0}, completion=${crewMetrics?.tokens?.completionTokens ?? 0}, total=${crewMetrics?.tokens?.totalTokens ?? 0}`
    );
  } finally {
    crew.destroy();
  }
};

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
