---
name: ax-crew-state
version: __VERSION__
description: "State management: shared state, StateInstance, set, get, getAll, reset, accessing state from class-based functions"
---

# State

Every `AxCrew` instance has a shared `StateInstance` at `crew.state`. All agents and class-based functions in the crew can access the same state.

## StateInstance API

```ts
interface StateInstance {
  set(key: string, value: any): void;   // Set a value
  get(key: string): any;                // Get a value
  getAll(): Record<string, any>;        // Get all key-value pairs (shallow copy)
  reset(): void;                        // Clear all state
}
```

## Core Behavior

- `crew.state` is created automatically when `new AxCrew(config)` is called.
- State is keyed by `crewId` (auto-generated UUID). Each crew instance has its own isolated state.
- State persists for the lifetime of the crew. Calling `crew.destroy()` calls `state.reset()`.
- Values can be any type: strings, objects, arrays, etc.

## Canonical Pattern

```ts
import { AxCrew } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig, FunctionRegistryType } from '@amitdeshmukh/ax-crew';
import type { AxFunction } from '@ax-llm/ax';
import dotenv from 'dotenv';
dotenv.config();

// Class-based function that reads from shared state
class SendEmail {
  private state: Record<string, any>;
  constructor(state: Record<string, any>) { this.state = state; }
  toFunction(): AxFunction {
    return {
      name: 'SendEmail',
      description: 'Send an email using configured SMTP credentials',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email' },
          subject: { type: 'string', description: 'Email subject' },
          body: { type: 'string', description: 'Email body' },
        },
        required: ['to', 'subject', 'body']
      },
      func: async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
        // Access env credentials set via crew.state.set("env", {...})
        const env = this.state.env || {};
        const smtpHost = env.SMTP_HOST;
        const smtpUser = env.SMTP_USER;
        const smtpPass = env.SMTP_PASS;
        // ... send email using credentials
        return { sent: true, to };
      }
    };
  }
}

const config: AxCrewConfig = {
  crew: [
    {
      name: "notifier",
      description: "An agent that sends email notifications",
      signature: "task:string -> result:string",
      provider: "openai",
      providerKeyName: "OPENAI_API_KEY",
      ai: { model: "gpt-4o-mini", temperature: 0 },
      functions: ["SendEmail"],
    }
  ]
};

async function main() {
  const functions: FunctionRegistryType = { SendEmail };
  const crew = new AxCrew(config, functions);

  // Set environment variables in shared state BEFORE adding agents
  crew.state.set("env", {
    SMTP_HOST: "smtp.example.com",
    SMTP_USER: "user@example.com",
    SMTP_PASS: "secret",
  });

  // You can also set arbitrary data
  crew.state.set("company", "Acme Corp");
  crew.state.set("maxRetries", 3);

  await crew.addAllAgents();
  const notifier = crew.agents?.get("notifier");

  const result = await notifier?.forward({ task: "Notify user about order shipped" });
  console.log(result?.result);

  // Read state back
  console.log("All state:", crew.state.getAll());
  console.log("Company:", crew.state.get("company"));

  // Reset state (clear all)
  crew.state.reset();

  crew.destroy();
}

main().catch(console.error);
```

## Setting Environment Credentials

The common pattern for passing credentials to class-based functions:

```ts
crew.state.set("env", {
  WORDPRESS_URL: "http://my-wordpress-site.com",
  WORDPRESS_USERNAME: "my-username",
  WORDPRESS_PASSWORD: "my-password",
});
```

Inside the class-based function, access via `this.state.env`:

```ts
class MyFunction {
  private state: Record<string, any>;
  constructor(state: Record<string, any>) { this.state = state; }
  toFunction(): AxFunction {
    return {
      name: 'MyFunction',
      description: 'Does something',
      parameters: { type: 'object', properties: {} },
      func: () => {
        const url = this.state.env?.WORDPRESS_URL;  // reads from shared state
        return url;
      }
    };
  }
}
```

## Accessing State from Agents

Each `StatefulAxAgent` has a `state` property that references the crew's shared state:

```ts
const agent = crew.agents?.get("myAgent");
// agent.state is the same StateInstance as crew.state
```

## Do Not Generate

- Do NOT assume state values exist without checking; always use optional chaining (e.g. `this.state.env?.KEY`).
- Do NOT call `crew.state.set("env", ...)` after `addAllAgents()` if class-based functions read state during construction -- set state first.
- Do NOT confuse `crew.state` (StateInstance with `set`/`get`/`getAll`/`reset`) with plain objects. The state object passed to class-based function constructors is a plain record, not the `StateInstance` interface.
- Do NOT store sensitive credentials in state if the state object might be logged or serialized. The `getAll()` method returns all stored values.

## References

- [write-post-and-publish-to-wordpress.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/write-post-and-publish-to-wordpress.ts)
- [src/state/index.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/src/state/index.ts)
- [src/types.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/src/types.ts)
