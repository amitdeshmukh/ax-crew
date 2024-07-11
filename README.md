# AxCrew - A Crew of AI Agents (built with AxLLM)

This repo simplifies development of [AxLLM](https://axllm.dev) AI Agents by using config to instantiate agents. This means you can write a library of functions, and quickly invoke AI agents to use them using a simple configuration file.

## Features
- **Crew Configuration**: Define a crew of agents in a YAML file. (see [agent_config.example.yaml](agent_config.example.yaml))
- **State Management**: Share state across agents in a crew, as well as with functions used by those agents.
- **Task Execution**: Plan and execute tasks using agents in the crew.

## Getting Started

### Installation
```bash
npm install @buddhic-ai/agents
```

### Environment Setup
Refer to the [.env.example](.env.example) file for the required environment variables. These will need to be set in the environment where the agents are run.

## Crew Configuration
A Crew is a team of agents that work together to achieve a common goal. The configuration file for a crew is a YAML file that defines the agents in the crew, along with their configuration.

An example configuration is provided in `agent_config.example.yaml`. 

### Creating the Crew
To initialize a crew of agents, create a configuration file in YAML format, and pass it to the `AxCrew` constructor.

See [agent_config.example.yaml](agent_config.example.yaml) for an example configuration file.

```javascript
// Import the AgentCrew class
import AgentCrew from './src/agents/index.js';

// Create a new instance of AgentCrew
const configFilePath = './agent_config.example.yaml';
const crew = new AgentCrew(configFilePath);
```

### Adding Agents to the Crew
You can add a sub-set of defined agents from the configuration file to the crew by passing their names as an array to the `addAgents` method.

Please ensure that the agents are defined in the configuration file before adding them to the crew. Also, the order in which the agents are added to the crew is important, as an error will be thrown if an agent is added before its dependent agents.

For example, the `Manager` agent in the configuration file depends on the `Planner` and `Calculator` agents. Therefore, the `Planner` and `Calculator` agents must be added to the crew before the `Manager` agent.

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
// Set some state (key/value) for the crew
crew.state.set('name', 'Crew1');
crew.state.set('location', 'Earth');

// Get the state for the crew
crew.state.get('name'); // 'Crew1'
crew.state.getAll(); // { name: 'Crew1', location: 'Earth' }
``` 

State can also be set/get by individual agents in the crew. This state is shared with all agents and functions if passed in through the functions class constructor.

```javascript
Planner.state.set('plan', 'some plan'); 
console.log(Manager.state.getAll()); // { name: 'Crew1', location: 'Earth', plan: 'some plan' }
```

## Completing a task

An example of how to complete a task using the agents is shown below. The `Planner` agent is used to plan the task, and the `Manager` agent is used to execute the task.

```javascript
const userQuery = "i referred a friend to active and they were hired and started work on 1st july. But i did not receive my referral bonus. what amount should i have received?";

console.log(`\n\nQuestion: ${userQuery}`);

const planResponse = await Planner.forward({ task: userQuery });
const managerResponse = await Manager.forward({ question: userQuery, plan: planResponse.plan });

const plan = planResponse.plan;
const answer = managerResponse.answer;

console.log(`\n\nPlan: ${plan}`);
console.log(`\n\nAnswer: ${answer}`);
```
