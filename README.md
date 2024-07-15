![image](axcrew.png)

# AxCrew - A Crew of AI Agents (built with AxLLM)

This repo simplifies development of [AxLLM](https://axllm.dev) AI Agents by using config to instantiate agents. This means you can write a library of functions, and quickly invoke AI agents to use them using a simple configuration file.

## Features
- **Crew Configuration**: Define a crew of agents in a YAML file. (see [agent_config.example.yaml](agent_config.example.yaml))
- **State Management**: Share state across agents in a crew, as well as with functions used by those agents.
- **Task Execution**: Plan and execute tasks using agents in the crew.

## Getting Started

### Installation
```bash
npm install @amitdeshmukh/ax-crew
```

### Environment Setup
Refer to the [.env.example](.env.example) file for the required environment variables. These will need to be set in the environment where the agents are run.

## Usage

### Initializing a Crew
A Crew is a team of agents that work together to achieve a common goal. The configuration file for a crew is a YAML file that defines the agents in the crew, along with their individual configurations.

See [agent_config.example.yaml](agent_config.example.yaml) for an example.

To initialize a crew of agents, pass a config file to the `AxCrew` constructor.

```javascript
// Import the AxCrew class
import { AxCrew } from '@amitdeshmukh/ax-crew';

// Create a new instance of AxCrew
const configFilePath = './agent_config.example.yaml';
const crew = new AxCrew(configFilePath);
```

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
const crew = new AxCrew('./agent_config.example.yaml', AxCrewFunctions);
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
