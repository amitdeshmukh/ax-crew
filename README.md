![image](axcrew.png)

# AxCrew - A Crew of AI Agents (built with AxLLM)

This repo simplifies development of [AxLLM](https://axllm.dev) AI Agents by using config to instantiate agents. This means you can write a library of functions, and quickly invoke AI agents to use them using a simple configuration file.

## Features
- **Crew Configuration**: Define a crew of agents in a JSON file. (see [agentConfig.json](agentConfig.json) as an example)
- **State Management**: Share state across agents in a crew, as well as with functions used by those agents.
- **Task Execution**: Plan and execute tasks using agents in the crew.

## Getting Started

### Installation
Install this package:
```bash
npm install @amitdeshmukh/ax-crew
```
AxLLM is a peer dependency, so you will need to install it separately. 

**Note:** Currently, we support AxLLM v10.0.9. We are working on updating this package to support the latest version of AxLLM as it introduces some breaking changes.

```bash
npm install @ax-llm/ax@10.0.9
```

### TypeScript Support
This package includes TypeScript declarations and provides full type safety. Here's how to use it with TypeScript:

```typescript
import { AxCrew, AxCrewFunctions, FunctionRegistryType, StateInstance } from '@amitdeshmukh/ax-crew';
import type { AxFunction } from '@ax-llm/ax';

// Type-safe configuration
const config = {
  crew: [{
    name: "Planner",
    description: "Creates a plan to complete a task",
    signature: "task:string \"a task to be completed\" -> plan:string \"a plan to execute the task\"",
    provider: "google-gemini",
    providerKeyName: "GEMINI_API_KEY",
    ai: {
      model: "gemini-1.5-pro",
      temperature: 0
    }
  }]
};

// Create custom functions with type safety
class MyCustomFunction {
  constructor(private state: Record<string, any>) {}
  
  toFunction(): AxFunction {
    return {
      name: 'MyCustomFunction',
      description: 'Does something useful',
      parameters: {
        type: 'object',
        properties: {
          inputParam: { type: 'string', description: "input to the function" }
        }
      },
      func: async ({ inputParam }) => {
        // Implementation
        return inputParam;
      }
    };
  }
}

// Type-safe function registry
const myFunctions: FunctionRegistryType = {
  MyCustomFunction
};

// Create crew with type checking
const crew = new AxCrew(config, myFunctions);

// Set and get state
crew.state.set('key', 'value');
const value: string = crew.state.get('key');

// Add agents to the crew
const agents = crew.addAgentsToCrew(['Planner']);
const planner = agents?.get('Planner');

if (planner) {
  // Agent usage with function overloads
  // Direct usage - AI config from agent construction is used
  const response = await planner.forward({ task: "Plan something" });
  
  // Sub-agent usage - when used by another agent (AI is ignored and agent's own config is used)
  const subAgentResponse = await planner.forward(ai, { task: "Plan something" });
  
  const cost = planner.getUsageCost();
  
  if (cost) {
    console.log(`Total cost: $${cost.totalCost}`);
    console.log(`Total tokens: ${cost.tokenMetrics.totalTokens}`);
  }
}
```

Key TypeScript features:
- Full type definitions for all classes, methods, and properties
- Type-safe configuration objects
- Proper typing for function registries and custom functions
- Type checking for state management
- Comprehensive type safety for agent operations and responses
- Usage cost tracking with proper types

### Environment Setup
Refer to the [.env.example](.env.example) file for the required environment variables. These will need to be set in the environment where the agents are run.

## Usage

### Initializing a Crew
A Crew is a team of agents that work together to achieve a common goal. You can configure your crew in two ways:

1. Using a JSON configuration file that defines the agents in the crew, along with their individual configurations.
2. Directly passing a JSON object with the crew configuration.

#### Using a Configuration File
See [agentConfig.json](agentConfig.json) for an example configuration file.

```javascript
// Import the AxCrew class
import { AxCrew } from '@amitdeshmukh/ax-crew';

// Create a new instance of AxCrew using a config file
const configFilePath = './agentConfig.json';
const crew = new AxCrew(configFilePath);
```

#### Using a Direct Configuration Object
You can also pass the configuration directly as a JSON object:

```javascript
// Import the AxCrew class
import { AxCrew } from '@amitdeshmukh/ax-crew';

// Create the configuration object
const config = {
  crew: [
    {
      name: "Planner",
      description: "Creates a plan to complete a task",
      signature: "task:string \"a task to be completed\" -> plan:string \"a plan to execute the task in 5 steps or less\"",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-1.5-flash",
        temperature: 0
      },
      options: {
        debug: false
      }
    }
    // ... more agents
  ]
};

// Create a new instance of AxCrew using the config object
const crew = new AxCrew(config);
```

Both methods support the same configuration structure and options. Choose the one that best fits your use case:
- Use a configuration file when you want to:
  - Keep your configuration separate from your code
  - Share configurations across different projects
  - Version control your configurations
- Use a direct configuration object when you want to:
  - Generate configurations dynamically
  - Modify configurations at runtime
  - Keep everything in one file for simpler projects

### Agent Examples
You can provide examples to guide the behavior of your agents using the `examples` field in the agent configuration. Examples help the agent understand the expected input/output format and improve its responses.

```javascript
{
  "name": "MathTeacher",
  "description": "Solves math problems with step by step explanations",
  "signature": "problem:string \"a math problem to solve\" -> solution:string \"step by step solution with final answer\"",
  "provider": "google-gemini",
  "providerKeyName": "GEMINI_API_KEY",
  "ai": {
    "model": "gemini-1.5-pro",
    "temperature": 0
  },
  "examples": [
    {
      "problem": "what is the square root of 144?",
      "solution": "Let's solve this step by step:\n1. The square root of a number is a value that, when multiplied by itself, gives the original number\n2. For 144, we need to find a number that when multiplied by itself equals 144\n3. 12 × 12 = 144\nTherefore, the square root of 144 is 12"
    },
    {
      "problem": "what is the cube root of 27?",
      "solution": "Let's solve this step by step:\n1. The cube root of a number is a value that, when multiplied by itself twice, gives the original number\n2. For 27, we need to find a number that when cubed equals 27\n3. 3 × 3 × 3 = 27\nTherefore, the cube root of 27 is 3"
    }
  ]
}
```

The examples should:
- Match the input/output signature of your agent
- Demonstrate the desired format and style of responses
- Include edge cases or specific patterns you want the agent to learn
- Be clear and concise while showing the expected behavior

Examples are particularly useful for:
- Teaching agents specific response formats
- Demonstrating step-by-step problem-solving approaches
- Showing how to handle edge cases
- Maintaining consistent output styles across responses

### Function Registry
Functions (aka Tools) are the building blocks of agents. They are used to perform specific tasks, such as calling external APIs, databases, or other services.

The `FunctionRegistry` is a central place where all the functions that agents can use are registered. This allows for easy access and management of functions across different agents in the crew.

To use the `FunctionRegistry`, you need to either:
- import and use the built-in functions from the `@amitdeshmukh/ax-crew` package, or
- bring your own functions before initializing `AxCrew`. 

Here's an example of how to set up the `FunctionRegistry` with built-in functions:

```javascript
import { AxCrewFunctions } from '@amitdeshmukh/ax-crew';
const crew = new AxCrew(configFilePath, AxCrewFunctions);
```

if you want to bring your own functions, you can do so by creating a new instance of `FunctionRegistry` and passing it to the `AxCrew` constructor.

```typescript
import { FunctionRegistryType } from '@amitdeshmukh/ax-crew';

const myFunctions: FunctionRegistryType = {
  GoogleSearch: googleSearchInstance.toFunction()
};

const crew = new AxCrew(configFilePath, myFunctions);
```

### Adding Agents to the Crew
You can add a sub-set of available agents from the config file to the crew by passing their names as an array to the `addAgentsToCrew` method.

Ensure that:
  - agents are defined in the configuration file before adding them to the crew. 
  - agents added in the right order (an error will be thrown if an agent is added before its dependent agents).

For example, the `Manager` agent in the configuration file depends on the `Planner` and `Calculator` agents. So the `Planner` and `Calculator` agents must be added to the crew before the `Manager` agent can be added.

Agents can be configured with any functions from the `FunctionRegistry` available to the crew.

```javascript
// Add agents by providing their names
const agentNames = ['Planner', 'Calculator', 'Manager'];
const agents = crew.addAgentsToCrew(agentNames);

// Get agent instances
const Planner = agents.get("Planner");
const Manager = agents.get("Manager");
```

### State Management

The `StatefulAxAgent` class in `src/agents/index.js` allows for shared state functionality across agents. Sub-agents can be added to an agent to create complex behaviors. All agents in the crew have access to the shared state. State can also be shared with functions that are passed to the agents. To do this, pass the `state` object as an argument to the function class as shown here https://axllm.dev/guides/functions-1/


```javascript
// Set some state (key/value) for this crew
crew.state.set('name', 'Crew1');
crew.state.set('location', 'Earth');

// Get the state for the crew
crew.state.get('name'); // 'Crew1'
crew.state.getAll(); // { name: 'Crew1', location: 'Earth' }
``` 

State can also be set/get by individual agents in the crew. This state is shared with all agents. It is also passed to any functions expressed as a class in `FunctionsRegistry`.

```javascript
Planner.state.set('plan', 'Fly to Mars'); 
console.log(Manager.state.getAll()); // { name: 'Crew1', location: 'Earth', plan: 'Fly to Mars' }
```

## Example Agent task

An example of how to complete a task using the agents is shown below. The `Planner` agent is used to plan the task, and the `Manager` agent is used to execute the task.

```javascript
import { AxCrew, AxCrewFunctions } from '@amitdeshmukh/ax-crew';

// Create a new instance of AxCrew
const crew = new AxCrew('./agentConfig.json', AxCrewFunctions);
crew.addAgentsToCrew(['Planner', 'Calculator', 'Manager']);

// Get agent instances
const Planner = crew.agents.get("Planner");
const Manager = crew.agents.get("Manager");

// User query
const userQuery = "whats the square root of the number of days between now and Christmas";

console.log(`\n\nQuestion: ${userQuery}`);

// Forward the user query to the agents
const planResponse = await Planner.forward({ task: userQuery });
const managerResponse = await Manager.forward({ question: userQuery, plan: planResponse.plan });

// Get and print the plan and answer from the agents
const plan = planResponse.plan;
const answer = managerResponse.answer;

console.log(`\n\nPlan: ${plan}`);
console.log(`\n\nAnswer: ${answer}`);
```

### Tracking Usage Costs

The package provides precise cost tracking capabilities for monitoring API usage across individual agents and the entire crew. Costs are calculated using high-precision decimal arithmetic to ensure accuracy.

```javascript
// After running an agent's forward method
const response = await Planner.forward({ task: userQuery });

// Get individual agent costs
const agentCost = Planner.getUsageCost();
console.log(agentCost);
/* Output example:
{
  promptCost: "0.0003637500000",
  completionCost: "0.0006100000000",
  totalCost: "0.0009737500000",
  tokenMetrics: {
    promptTokens: 291,
    completionTokens: 122,
    totalTokens: 413
  }
}
*/

// Get aggregated costs for all agents in the crew
const crewCosts = crew.getAggregatedCosts();
console.log(crewCosts);
/* Output example:
{
  totalCost: "0.0025482500000",
  byAgent: {
    "Planner": { ... },
    "Calculator": { ... },
    "Manager": { ... }
  },
  aggregatedMetrics: {
    promptTokens: 850,
    completionTokens: 324,
    totalTokens: 1174,
    promptCost: "0.0010625000000",
    completionCost: "0.0014857500000"
  }
}
*/

// Reset cost tracking if needed
crew.resetCosts();
```

Cost tracking features:
- High-precision decimal calculations using decimal.js
- Per-agent cost breakdown
- Aggregated crew-wide metrics
- Token usage statistics
- Support for different pricing tiers per model
- Persistent cost tracking across multiple agent runs

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes and version updates.