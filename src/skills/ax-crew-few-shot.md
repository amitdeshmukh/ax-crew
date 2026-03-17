---
name: ax-crew-few-shot
description: AxCrew few-shot examples via examples[] field in AgentConfig. Covers in-context learning, demonstration structure, input/output field matching, setExamplesCompat() for dynamic updates, and when to use examples vs definition/prompt.
version: "8.7.2"
---

# AxCrew Few-Shot Examples

The `examples[]` field in `AgentConfig` provides DSPy-style few-shot demonstrations. Each example contains input AND output field values matching the agent's signature.

## Basic Structure

```typescript
{
  name: "Agent",
  signature: "question:string -> answer:string",
  // ...
  examples: [
    { question: "What is 2+2?", answer: "4" },
    { question: "Capital of France?", answer: "Paris" },
  ],
}
```

Every key in the example object must match a field name from the signature (inputs and/or outputs).

## Full Example

```typescript
import { AxCrew } from 'ax-crew';
import type { AxCrewConfig } from 'ax-crew';

const config: AxCrewConfig = {
  crew: [
    {
      name: "SupportAgent",
      description: "Customer support agent that follows company tone",
      signature:
        "ticket:string, standardPolicies:string[] -> politeSupportResponse:string, decision:string, policyApplied:string",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0.7 },
      examples: [
        {
          ticket: "I want to return my laptop purchased 10 days ago.",
          standardPolicies: ["Returns within 30 days only"],
          politeSupportResponse:
            "Of course! Your laptop is within our 30-day return window. I'll process that right away.",
          decision: "approved",
          policyApplied: "Returns within 30 days only",
        },
        {
          ticket: "Refund my sale item please.",
          standardPolicies: ["Sale items: no returns, no refunds"],
          politeSupportResponse:
            "I understand your frustration. Unfortunately, sale items are final sale per our policy. I'd be happy to help with an exchange instead.",
          decision: "denied",
          policyApplied: "Sale items: no returns, no refunds",
        },
      ],
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  await crew.addAllAgents();

  const agent = crew.agents?.get("SupportAgent");
  const result = await agent!.forward({
    ticket: "I bought headphones 15 days ago and they broke.",
    standardPolicies: ["Returns within 30 days only", "Defective items replaced free"],
  });

  console.log(result.politeSupportResponse);
  console.log(result.decision);
  crew.destroy();
}

main().catch(console.error);
```

## Multi-Field Examples

```typescript
{
  name: "Planner",
  description: "Creates execution plans",
  signature: "task:string, context:string -> plan:string, steps:string[]",
  provider: "openai",
  ai: { model: "gpt-4o" },
  examples: [
    {
      task: "Deploy new API version",
      context: "Kubernetes cluster, 3 environments",
      plan: "Blue-green deployment with canary rollout",
      steps: [
        "Run integration tests",
        "Deploy to staging",
        "Canary 10% traffic",
        "Full rollout",
      ],
    },
    {
      task: "Migrate database",
      context: "PostgreSQL 14 to 16, 500GB data",
      plan: "Logical replication with minimal downtime",
      steps: [
        "Set up PG16 replica",
        "Enable logical replication",
        "Sync and verify",
        "Switch over",
      ],
    },
  ],
}
```

## Dynamic Example Updates (setExamplesCompat)

Update examples at runtime after agent initialization:

```typescript
const crew = new AxCrew(config);
await crew.addAllAgents();

const agent = crew.agents?.get("SupportAgent");

// Update examples dynamically
(agent as any).setExamplesCompat([
  {
    ticket: "My order never arrived.",
    standardPolicies: ["Reship if not delivered in 14 days"],
    politeSupportResponse: "I'm sorry about that! Let me reship your order immediately.",
    decision: "approved",
    policyApplied: "Reship if not delivered in 14 days",
  },
]);
```

`setExamplesCompat()` replaces all current examples. It is preferred over `setExamples()` (deprecated) for compatibility across Ax runtime versions.

## When to Use examples[] vs definition/prompt

| Use `examples[]` | Use `definition` / `prompt` |
|---|---|
| Structured output consistency | System persona / role description |
| Demonstrate tone, format, style | Complex multi-paragraph instructions |
| Classification patterns | Domain context / background knowledge |
| Input-output mappings | Behavioral constraints |

Best practice: use `definition`/`prompt` for WHO the agent is, `examples[]` for HOW it should respond.

## Do Not Generate

- Do NOT embed examples as text in `definition` or `prompt` -- use the `examples[]` field for structured few-shot learning
- Do NOT include fields in examples that are not in the signature -- keys must match signature field names
- Do NOT provide only input fields in examples -- include BOTH input and output fields to demonstrate expected behavior
- Do NOT use `setExamples()` directly -- use `setExamplesCompat()` for cross-version compatibility
- Do NOT add excessive examples (2-5 is typical) -- too many increase token usage without proportional quality gain

## References

- [ace-customer-support.ts](../examples/ace-customer-support.ts) -- agent with structured examples and ACE feedback
- [basic-researcher-writer.ts](../examples/basic-researcher-writer.ts) -- simple agent config
