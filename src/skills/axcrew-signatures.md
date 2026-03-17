---
name: axcrew-signatures
description: AxCrew DSPy-style signature format for defining agent inputs/outputs. Covers signature syntax, types (string, number, boolean, class, string[], json, image, audio, date), optional fields (?), field descriptions, and AxSignature builder alternative.
version: "8.7.3"
---

# AxCrew Signatures

DSPy-style string format: `"input1:type, input2:type -> output1:type, output2:type"`

## Supported Types

| Type | Description |
|------|-------------|
| `string` | Text (default if omitted) |
| `number` | Numeric |
| `boolean` | True/false |
| `string[]` | Array of strings |
| `json` | Arbitrary JSON object |
| `class` | Classification label |
| `image` | Image input |
| `audio` | Audio input |
| `date` | Date value |

## Signature Syntax

```typescript
// Minimal — types default to string
"question -> answer"

// Explicit types
"question:string -> answer:string"

// Multiple inputs and outputs
"question:string, context:string -> answer:string, confidence:number"

// Optional fields use ? suffix
"query:string, context?:string -> answer:string"

// Field descriptions in quotes
'question:string "The user question", context:string "Reference text" -> answer:string "Final answer", confidence:number "0-1 score"'

// Array output
'context:string, query:string -> answer:string, keyFindings:string[] "Analyzes context and returns findings"'

// Classification
"text:string -> sentiment:class"

// Multi-modal
"image:image, question:string -> caption:string"

// JSON output
"query:string -> result:json"
```

## Full Examples in AgentConfig

```typescript
import { AxCrew } from 'ax-crew';
import type { AxCrewConfig } from 'ax-crew';

const config: AxCrewConfig = {
  crew: [
    // Simple Q&A
    {
      name: "QA",
      description: "Answers questions",
      signature: "question:string -> answer:string",
      provider: "openai",
      ai: { model: "gpt-4o", temperature: 0 },
    },
    // Multi-field with descriptions
    {
      name: "Analyst",
      description: "Analyzes data and returns structured findings",
      signature:
        'context:string, query:string -> answer:string, keyFindings:string[] "Analyzes context and returns findings"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
    },
    // Optional input field
    {
      name: "Summarizer",
      description: "Summarizes text with optional style",
      signature: "text:string, style?:string -> summary:string",
      provider: "openai",
      ai: { model: "gpt-4o-mini" },
    },
    // Classification
    {
      name: "Classifier",
      description: "Classifies sentiment",
      signature: 'question:string -> sentiment:string "positive, negative, or neutral"',
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-2.5-flash", temperature: 0 },
    },
    // Multi-output with confidence
    {
      name: "Extractor",
      description: "Extracts entities from text",
      signature: "text:string -> entities:string[], confidence:number",
      provider: "openai",
      ai: { model: "gpt-4o" },
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  await crew.addAllAgents();

  const qa = crew.agents?.get("QA");
  const result = await qa?.forward({ question: "What is TypeScript?" });
  console.log(result?.answer);

  const analyst = crew.agents?.get("Analyst");
  const analysis = await analyst?.forward({
    context: "Q1 revenue: $10M, Q2: $15M, Q3: $12M",
    query: "What is the revenue trend?",
  });
  console.log(analysis?.answer, analysis?.keyFindings);

  crew.destroy();
}

main().catch(console.error);
```

## AxSignature Builder Alternative

The `signature` field also accepts an `AxSignature` object from `@ax-llm/ax`:

```typescript
import { AxSignature } from '@ax-llm/ax';
import type { AxCrewConfig } from 'ax-crew';

const sig = new AxSignature(
  "question:string, context:string -> answer:string, confidence:number"
);

const config: AxCrewConfig = {
  crew: [
    {
      name: "Agent",
      description: "Uses AxSignature object",
      signature: sig, // AxSignature instance accepted
      provider: "openai",
      ai: { model: "gpt-4o" },
    },
  ],
};
```

## Do Not Generate

- Do NOT omit the `->` separator between inputs and outputs
- Do NOT use unsupported types (e.g., `int`, `float`, `array`, `object` -- use `number`, `string[]`, `json`)
- Do NOT put field descriptions outside quotes: use `'field:type "desc"'` not `field:type desc`
- Do NOT use `|` or union types in signatures -- use `class` type for enums
- Do NOT confuse `string[]` (array of strings) with `json` (arbitrary object)
- Do NOT wrap the signature string in `AxSignature()` when passing to config -- raw strings work directly

## References

- [rlm-long-task.ts](examples/rlm-long-task.ts) -- array output in signature
- [rlm-shared-fields.ts](examples/rlm-shared-fields.ts) -- field descriptions in quotes
- [ace-customer-support.ts](examples/ace-customer-support.ts) -- multi-output signature
