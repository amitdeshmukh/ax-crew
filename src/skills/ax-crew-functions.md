---
name: ax-crew-functions
version: 8.7.2
description: "Functions and tools: FunctionRegistryType, AxFunction, toFunction, custom functions, AxCrewFunctions, class-based functions with state"
---

# Functions

Agents call tools via a `FunctionRegistryType` -- a map of function names to either plain `AxFunction` objects or class-based constructors that receive shared state.

## Two Patterns

### Object-based (plain AxFunction)

```ts
import type { AxFunction } from '@ax-llm/ax';

const MyTool: AxFunction = {
  name: 'MyTool',
  description: 'Does something useful',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'The input value' }
    },
    required: ['input']
  },
  func: ({ input }: { input: string }) => {
    return `Processed: ${input}`;
  }
};
```

### Class-based (with state access)

Constructor receives shared state. Must implement `toFunction()` returning an `AxFunction`.

```ts
import type { AxFunction } from '@ax-llm/ax';

class WordPressPost {
  private state: Record<string, any>;

  constructor(state: Record<string, any>) {
    this.state = state;
  }

  toFunction(): AxFunction {
    return {
      name: 'WordPressPost',
      description: 'Creates a post on WordPress',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Post title' },
          content: { type: 'string', description: 'Post content' },
          status: { type: 'string', description: 'Post status (draft, publish, private)' }
        },
        required: ['title', 'content', 'status']
      },
      func: async ({ title, content, status }: { title: string; content: string; status: string }) => {
        const env = this.state.env || {};
        const url = env.WORDPRESS_URL;
        const username = env.WORDPRESS_USERNAME;
        const password = env.WORDPRESS_PASSWORD;
        // ... make API call using credentials from state
        return { id: 123, link: `${url}/?p=123` };
      }
    };
  }
}
```

## FunctionRegistryType

```ts
type FunctionRegistryType = {
  [key: string]: AxFunction | { new(state: Record<string, any>): { toFunction: () => AxFunction } };
};
```

The registry key must match the name used in `AgentConfig.functions[]`.

## Built-in AxCrewFunctions

```ts
import { AxCrewFunctions } from '@amitdeshmukh/ax-crew';
// Contains: { CurrentDateTime, DaysBetweenDates }
```

**CurrentDateTime** -- returns current date/time in `iso`, `datetime`, or `date` format.

**DaysBetweenDates** -- calculates days between two ISO date strings. Parameters: `startDate`, `endDate`.

## Merging Registries

```ts
import { AxCrew, AxCrewFunctions } from '@amitdeshmukh/ax-crew';
import type { FunctionRegistryType } from '@amitdeshmukh/ax-crew';

const myFunctions: FunctionRegistryType = {
  MyTool: MyTool,
  WordPressPost: WordPressPost,  // class-based
};

// Merge built-in + custom
const crew = new AxCrew(config, { ...AxCrewFunctions, ...myFunctions });
```

Then reference by name in agent config:

```ts
{
  name: "poster",
  functions: ["CurrentDateTime", "WordPressPost"],
  // ...
}
```

## Canonical Pattern

Full runnable example adapted from the WordPress example:

```ts
import { AxCrew } from '@amitdeshmukh/ax-crew';
import type { AxCrewConfig, FunctionRegistryType } from '@amitdeshmukh/ax-crew';
import type { AxFunction } from '@ax-llm/ax';
import dotenv from 'dotenv';
dotenv.config();

// Plain AxFunction
const Summarize: AxFunction = {
  name: 'Summarize',
  description: 'Summarize text to a given length',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to summarize' },
      maxWords: { type: 'number', description: 'Maximum words' }
    },
    required: ['text']
  },
  func: ({ text, maxWords }: { text: string; maxWords?: number }) => {
    const limit = maxWords ?? 50;
    return text.split(' ').slice(0, limit).join(' ') + '...';
  }
};

// Class-based function with state access
class FetchFromAPI {
  private state: Record<string, any>;
  constructor(state: Record<string, any>) { this.state = state; }
  toFunction(): AxFunction {
    return {
      name: 'FetchFromAPI',
      description: 'Fetch data from a configured API endpoint',
      parameters: {
        type: 'object',
        properties: {
          endpoint: { type: 'string', description: 'API endpoint path' }
        },
        required: ['endpoint']
      },
      func: async ({ endpoint }: { endpoint: string }) => {
        const baseUrl = this.state.env?.API_BASE_URL || 'https://api.example.com';
        const resp = await fetch(`${baseUrl}${endpoint}`);
        return await resp.json();
      }
    };
  }
}

const config: AxCrewConfig = {
  crew: [
    {
      name: "assistant",
      description: "An assistant that can summarize text and fetch data",
      signature: "request:string -> response:string",
      provider: "openai",
      providerKeyName: "OPENAI_API_KEY",
      ai: { model: "gpt-4o-mini", temperature: 0.5 },
      functions: ["Summarize", "FetchFromAPI"],
    }
  ]
};

async function main() {
  const customFunctions: FunctionRegistryType = {
    Summarize,
    FetchFromAPI,
  };
  const crew = new AxCrew(config, customFunctions);

  // Set state for class-based functions
  crew.state.set("env", { API_BASE_URL: "https://api.example.com" });

  await crew.addAllAgents();
  const assistant = crew.agents?.get("assistant");
  const result = await assistant?.forward({ request: "Summarize the latest news" });
  console.log(result?.response);
  crew.destroy();
}

main().catch(console.error);
```

## Do Not Generate

- Do NOT define functions inline in AgentConfig; always use a `FunctionRegistryType` registry passed to the `AxCrew` constructor.
- Do NOT forget that class-based function constructors receive `state: Record<string, any>`, not `StateInstance`. Access values directly (e.g. `this.state.env`), since the state object is a plain record populated via `crew.state.set()`.
- Do NOT use a registry key that differs from the function name used in `AgentConfig.functions[]` -- they must match.
- Do NOT import `AxCrewFunctions` from `@ax-llm/ax`; import from `@amitdeshmukh/ax-crew`.

## References

- [write-post-and-publish-to-wordpress.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/write-post-and-publish-to-wordpress.ts)
- [src/functions/dateTime.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/src/functions/dateTime.ts)
- [src/functions/index.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/src/functions/index.ts)
