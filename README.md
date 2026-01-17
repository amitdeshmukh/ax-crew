![image](axcrew.png)

[![npm version](https://img.shields.io/npm/v/@amitdeshmukh/ax-crew.svg)](https://www.npmjs.com/package/@amitdeshmukh/ax-crew) [![npm downloads](https://img.shields.io/npm/dm/@amitdeshmukh/ax-crew.svg)](https://www.npmjs.com/package/@amitdeshmukh/ax-crew)

### AxCrew — build a crew of AI agents with shared state (powered by AxLLM)

AxCrew lets you define a team of AI agents in config and run them together with shared state, tools, streaming, MCP, and built‑in metrics/cost tracking. Bring your own functions or use the provided registry.

### Why AxCrew
- **Config-first crews**: Declare agents once; instantiate on demand.
- **Shared state**: Simple key/value state all agents can read/write.
- **Sub‑agents and tools**: Compose agents and functions cleanly.
- **Streaming**: Real‑time token streaming for responsive UX.
- **MCP**: Connect agents to MCP servers (STDIO, HTTP SSE, Streamable HTTP).
- **Metrics & costs**: Per‑agent and crew snapshots, with estimated USD.

### Install
Install this package:
```bash
npm install @amitdeshmukh/ax-crew
```
AxLLM is a peer dependency, so you will need to install it separately. 

```bash
npm install @ax-llm/ax @ax-llm/ax-tools
```

Requirements: Node.js >= 21.

### Environment
Set provider keys in your environment. Example `.env`:
```bash
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
AZURE_OPENAI_API_KEY=...
```
In each agent config, set `providerKeyName` to the env var name. AxCrew resolves the key at runtime by reading `process.env[providerKeyName]` in Node or `globalThis[providerKeyName]` in the browser. Ensure your env is loaded (for example, import `dotenv/config` in Node) before creating the crew.

#### Provider-specific arguments (`providerArgs`)
Some providers require extra top-level configuration beyond `ai.model` (for example, Azure deployment details or Vertex AI project/region). Pass these via `providerArgs`. AxCrew forwards `providerArgs` to Ax unchanged; validation and semantics are handled by Ax. Refer to Ax provider docs for supported fields.

### Quickstart

```typescript
import { AxCrew, AxCrewFunctions, FunctionRegistryType, StateInstance } from '@amitdeshmukh/ax-crew';
import type { AxFunction } from '@ax-llm/ax';

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
await crew.addAgentsToCrew(['Planner']);
const planner = crew.agents?.get('Planner');

if (planner) {
  const response = await planner.forward({ task: "Plan something" });
  
  // Sub-agent usage - when used by another agent (AI is ignored and agent's own config is used)
  const subAgentResponse = await planner.forward(ai, { task: "Plan something" });
  
  // Metrics (per-agent and per-crew)
  const agentMetrics = (planner as any).getMetrics?.();
  const crewMetrics = crew.getCrewMetrics();
  console.log('Agent metrics:', agentMetrics);
  console.log('Crew metrics:', crewMetrics);
}
```

Key TypeScript features:
- Full type definitions for all classes, methods, and properties
- Type-safe configuration objects
- Proper typing for function registries and custom functions
- Type checking for state management
- Comprehensive type safety for agent operations and responses
- Usage cost tracking with proper types

### Concepts at a glance
- **Agent**: An LLM program with a `signature`, `provider`, `ai` model config, optional `examples`, and optional `mcpServers`.
- **Sub‑agents**: List other agent names in `agents` to compose behaviors.
- **Functions (tools)**: Register callable functions via a registry and reference by name in agent `functions`.
- **State**: `crew.state.set/get/getAll()` shared across all agents.
- **Persona**: Use `definition` (preferred) or `prompt` to set the system program. If both are present, `definition` wins.
- **Streaming**: Use `streamingForward()` for token streams.
- **Metrics**: Per‑agent `getMetrics()` + crew‑level `getCrewMetrics()` snapshots.

## Usage

### Initializing a Crew
Pass a JSON object to the `AxCrew` constructor:

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

AxCrew no longer supports reading from a configuration file to remain browser-compatible.

### Agent Persona: definition and prompt

- **definition**: Detailed persona/program description used as the system prompt. Recommended for precise control. Must be at least 100 characters.
- **prompt**: An alias for `definition`. If both are provided, **definition** takes precedence.

Add either field to any agent config. The chosen value becomes the Ax agent's underlying program description (system prompt).

```json
{
  "name": "Planner",
  "description": "Creates a plan to complete a task",
  "prompt": "You are a meticulous planning assistant. Produce concise, executable step-by-step plans with clear justifications, constraints, and assumptions. Prefer brevity, avoid fluff, and ask for missing critical details before proceeding when necessary.",
  "signature": "task:string -> plan:string",
  "provider": "google-gemini",
  "providerKeyName": "GEMINI_API_KEY",
  "ai": { "model": "gemini-1.5-flash", "temperature": 0 }
}
```

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
There are three ways to add agents to your crew, each offering different levels of control:

#### Method 1: Add All Agents Automatically
This is the simplest method that automatically handles all dependencies:

```javascript
// Initialize all agents defined in the config
await crew.addAllAgents();

// Get agent instances
const planner = crew.agents?.get("Planner");
const manager = crew.agents?.get("Manager");
```

This method:
- Reads all agents from your configuration
- Automatically determines the correct initialization order based on dependencies
- Initializes all agents in the proper sequence
- Throws an error if there are circular dependencies

#### Method 2: Add Multiple Agents with Dependencies
This method allows you to initialize a subset of agents while still handling dependencies automatically:

```javascript
// Add multiple agents - dependencies will be handled automatically
await crew.addAgentsToCrew(['Manager', 'Planner', 'Calculator']);

// Or add them in multiple steps - order doesn't matter as dependencies are handled
await crew.addAgentsToCrew(['Calculator']); // Will be initialized first
await crew.addAgentsToCrew(['Manager']);    // Will initialize Planner first if it's a dependency
```

This method:
- Takes an array of agent names you want to initialize
- Automatically handles dependencies even if not explicitly included
- Initializes agents in the correct order regardless of the order specified
- Throws an error if required dependencies are missing or if there are circular dependencies

#### Method 3: Add Individual Agents
This method gives you the most control but requires manual dependency management:

```javascript
// Add agents one by one - you must handle dependencies manually
await crew.addAgent('Calculator'); // Add base agent first
await crew.addAgent('Planner');    // Then its dependent
await crew.addAgent('Manager');    // Then agents that depend on both
```

This method:
- Gives you full control over the initialization process
- Requires you to handle dependencies manually
- Throws an error if you try to initialize an agent before its dependencies

#### Dependency Handling
The crew system automatically handles agent dependencies in the following ways:

1. **Explicit Dependencies**: Defined in the agent config using the `agents` field:
```javascript
{
  name: "Manager",
  // ... other config ...
  agents: ["Planner", "Calculator"] // Manager depends on these agents
}
```

2. **Initialization Order**: 
   - Base agents (no dependencies) are initialized first
   - Dependent agents are initialized only after their dependencies
   - Circular dependencies are detected and reported

3. **Error Handling**:
   - Missing dependencies are reported with clear error messages
   - Circular dependencies are detected and reported
   - Invalid agent names or configurations are caught early

4. **State Management**:
   - All initialized agents within a crew share the same state
   - Dependencies can access and modify shared state
   - State persists across all initialization methods

Choose the method that best fits your needs:
- Use `addAllAgents()` for simple cases where you want all agents
- Use `addAgentsToCrew()` when you need a subset of agents with automatic dependency handling
- Use `addAgent()` when you need fine-grained control over the initialization process

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
const crew = new AxCrew(config, AxCrewFunctions);
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

### Streaming Responses

The package supports streaming responses from agents, allowing you to receive and process agent outputs in real-time. This is particularly useful for long-running tasks or when you want to provide immediate feedback to users.

```javascript
import { AxCrew, AxCrewFunctions } from '@amitdeshmukh/ax-crew';

// Create and initialize crew as shown above
const crew = new AxCrew(config, AxCrewFunctions);
await crew.addAgentsToCrew(['Planner']);

const planner = crew.agents.get("Planner");

// Stream responses using the forward method
await planner.forward(
  { task: "Create a detailed plan for a website" },
  {
    onStream: (chunk) => {
      // Process each chunk of the response as it arrives
      console.log('Received chunk:', chunk);
    }
  }
);

// You can also use streaming with sub-agents
await planner.forward(
  ai,
  { task: "Create a detailed plan for a website" },
  {
    onStream: (chunk) => {
      process.stdout.write(chunk);
    }
  }
);
```

Key streaming features:
- Real-time response processing
- Support for both direct and sub-agent usage
- Customizable stream handling through callbacks
- Compatible with all agent types and configurations
- Maintains cost tracking and state management functionality

### Model Context Protocol (MCP) Support

AxCrew provides built-in support for the Model Context Protocol (MCP), allowing agents to connect to and use MCP servers for enhanced functionality. MCP enables agents to access external tools, data sources, and services in a standardized way.

#### Supported Transport Types

AxCrew supports three MCP transport types, replacing the deprecated `AxMCPHTTPTransport`:

1. **AxMCPStdioTransport** - For standard input/output communication
2. **AxMCPHTTPSSETransport** - For HTTP with Server-Sent Events
3. **AxMCPStreambleHTTPTransport** - For streamable HTTP communication

#### Configuration

Add MCP servers to your agent configuration using the `mcpServers` field:

##### STDIO Transport Configuration

For MCP servers that communicate via standard input/output:

```json
{
  "name": "DataAnalyst",
  "description": "Analyzes data using MCP tools",
  "signature": "data:string -> analysis:string",
  "provider": "openai",
  "providerKeyName": "OPENAI_API_KEY",
  "ai": {
    "model": "gpt-4",
    "temperature": 0
  },
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/files"],
      "env": {
        "NODE_ENV": "production"
      }
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"]
    }
  }
}
```

##### HTTP SSE Transport Configuration

For MCP servers accessible via HTTP with Server-Sent Events:

```json
{
  "name": "WebAnalyst",
  "description": "Analyzes web content using MCP tools",
  "signature": "url:string -> analysis:string",
  "provider": "anthropic",
  "providerKeyName": "ANTHROPIC_API_KEY",
  "ai": {
    "model": "claude-3-haiku",
    "temperature": 0
  },
  "mcpServers": {
    "api-server": {
      "sseUrl": "https://api.example.com/mcp/sse"
    }
  }
}
```

##### Streamable HTTP Transport Configuration

For MCP servers that support streamable HTTP communication:

```json
{
  "name": "StreamAnalyst",
  "description": "Processes streaming data using MCP tools",
  "signature": "stream:string -> results:string",
  "provider": "google-gemini",
  "providerKeyName": "GEMINI_API_KEY",
  "ai": {
    "model": "gemini-1.5-pro",
    "temperature": 0
  },
  "mcpServers": {
    "stream-processor": {
      "mcpEndpoint": "http://localhost:3002/stream",
      "options": {
        "authorization": "Bearer ey.JhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..-1234567890.1234567890",
        "headers": { 
          "X-Custom-Header": "custom-value"
        }
      }
    }
  }
}
```

##### Mixed Transport Configuration

You can use multiple transport types within the same agent:

```json
{
  "name": "MultiModalAgent",
  "description": "Uses multiple MCP servers with different transports",
  "signature": "task:string -> result:string",
  "provider": "openai",
  "providerKeyName": "OPENAI_API_KEY",
  "ai": {
    "model": "gpt-4",
    "temperature": 0
  },
  "mcpServers": {
    "local-files": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"]
    },
    "web-search": {
      "sseUrl": "http://localhost:3001/sse"
    },
    "data-stream": {
      "mcpEndpoint": "http://localhost:3002/stream"
    }
  }
}
```

#### MCP Server Examples

Here are some popular MCP servers you can use:

**Filesystem Server** (STDIO):
```json
"filesystem": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
}
```

**Brave Search Server** (STDIO):
```json
"brave-search": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-brave-search"],
  "env": {
    "BRAVE_API_KEY": "your-brave-api-key"
  }
}
```

**GitHub Server** (STDIO):
```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
  }
}
```

**PostgreSQL Server** (STDIO):
```json
"postgres": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-postgres"],
  "env": {
    "POSTGRES_CONNECTION_STRING": "postgresql://user:pass@localhost/db"
  }
}
```

#### Usage in Code

MCP functions are automatically available to agents once the servers are configured:

```javascript
import { AxCrew } from '@amitdeshmukh/ax-crew';

// Create crew with MCP-enabled agents
const crew = new AxCrew(config);
await crew.addAgent('DataAnalyst'); // Agent with MCP servers configured

const analyst = crew.agents.get('DataAnalyst');

// The agent can now use MCP functions automatically
const response = await analyst.forward({
  data: "Please analyze the sales data in /workspace/sales.csv"
});
// The agent will automatically use the filesystem MCP server to read the file
// and any other configured MCP tools for analysis
```

#### Best Practices

1. **Environment Variables**: Store sensitive information like API keys in environment variables rather than in the configuration file.

2. **Path Security**: For filesystem servers, always specify allowed paths to prevent unauthorized file access.

3. **Server Health**: Implement health checks for HTTP-based MCP servers to ensure reliability.

4. **Error Handling**: MCP server failures are handled gracefully - agents will continue to work with available tools.

5. **Debugging**: Enable debug mode to see MCP server initialization and communication logs:
```json
{
  "debug": true,
  "mcpServers": { ... }
}
```

#### Migration from Deprecated Transport

If you're upgrading from the deprecated `AxMCPHTTPTransport`, update your configuration:

**Before (deprecated):**
```json
"mcpServers": {
  "my-server": {
    "sseUrl": "http://localhost:3001/sse"
  }
}
```

**After (current):**
The configuration remains the same - the transport type is automatically detected and `AxMCPHTTPSSETransport` is used for `sseUrl` configurations. No changes to your configuration files are needed.

For new streamable HTTP servers, use:
```json
"mcpServers": {
  "my-stream-server": {
    "mcpEndpoint": "http://localhost:3002/stream",
    "options": {
      "timeout": 30000
    }
  }
}
```

### Tracking Usage Costs

The package provides metrics for monitoring API usage across individual agents and the entire crew. Estimated costs are accumulated precisely and rounded to 5 decimal places for reporting.

```javascript
// After running an agent's forward method
await Planner.forward({ task: userQuery });

// Per-agent metrics
const agentMetrics = (Planner as any).getMetrics?.();
console.log(agentMetrics);
/* Example:
{
  provider: "anthropic",
  model: "claude-3-haiku-20240307",
  requests: { totalRequests, totalErrors, errorRate, totalStreamingRequests, durationMsSum, durationCount },
  tokens: { promptTokens, completionTokens, totalTokens },
  estimatedCostUSD: 0.00091, // rounded to 5 decimals
  functions: { totalFunctionCalls, totalFunctionLatencyMs }
}
*/

// Crew metrics
const crewMetrics = crew.getCrewMetrics();
console.log(crewMetrics);
/* Example:
{
  requests: { ... },
  tokens: { promptTokens, completionTokens, totalTokens },
  estimatedCostUSD: 0.00255, // rounded to 5 decimals
  functions: { ... }
}
*/

// Reset tracked metrics
crew.resetCosts();
```

Notes:
- Legacy cost APIs (`getLastUsageCost`, `getAccumulatedCosts`, `getAggregatedCosts`) are superseded by metrics methods.
- Estimated cost values are numbers rounded to 5 decimal places.

### Telemetry Support (OpenTelemetry)

AxCrew provides optional OpenTelemetry integration for comprehensive observability. You can pass custom tracer and meter instances to monitor agent operations, track performance, and analyze behavior across your crew.

#### Features

- **Distributed Tracing**: Track agent execution flows, function calls, and dependencies
- **Metrics Collection**: Monitor token usage, costs, latency, and error rates
- **Multiple Exporters**: Support for console, Jaeger, Prometheus, and other OpenTelemetry backends

#### Setup

Install OpenTelemetry dependencies:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-trace-node @opentelemetry/sdk-metrics
```

Optional: Install exporters for enhanced visualization:

```bash
# For Jaeger tracing UI
npm install @opentelemetry/exporter-jaeger

# For Prometheus metrics
npm install @opentelemetry/exporter-prometheus
```

#### Basic Configuration

```typescript
import { AxCrew } from '@amitdeshmukh/ax-crew';
import { trace, metrics } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

// Initialize OpenTelemetry
const tracerProvider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())]
});
tracerProvider.register();

const meterProvider = new MeterProvider();
metrics.setGlobalMeterProvider(meterProvider);

// Get tracer and meter instances
const tracer = trace.getTracer('my-app');
const meter = metrics.getMeter('my-app');

// Pass to AxCrew
const crew = new AxCrew(
  config,
  AxCrewFunctions,
  undefined,
  {
    telemetry: {
      tracer,
      meter
    }
  }
);
```

#### What Gets Traced

When telemetry is enabled, AxCrew automatically instruments:

- **Agent Execution**: Each agent's `forward()` call creates a span with timing and metadata
- **Function Calls**: Tool/function invocations are traced with parameters and results
- **Provider Information**: Model name, provider, and configuration details
- **Token Metrics**: Input/output tokens and estimated costs
- **Errors**: Exceptions and failures are captured with full context

#### Advanced Configuration with Jaeger

For enhanced visualization, you can export traces to Jaeger:

```typescript
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

const tracerProvider = new NodeTracerProvider({
  spanProcessors: [
    new SimpleSpanProcessor(new ConsoleSpanExporter()),
    new SimpleSpanProcessor(new JaegerExporter({
      endpoint: 'http://localhost:14268/api/traces'
    }))
  ]
});
tracerProvider.register();

// ... rest of setup
```

Start Jaeger with Docker:

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 14268:14268 \
  jaegertracing/all-in-one:latest
```

View traces at: http://localhost:16686

#### Complete Example

See [examples/telemetry-demo.ts](examples/telemetry-demo.ts) for a full working example that demonstrates:

- Setting up OpenTelemetry with console and Jaeger exporters
- Configuring multiple agents with different providers
- Running a multi-step workflow with telemetry tracking
- Viewing traces and metrics in the console and Jaeger UI

Run the example:

```bash
# With console output only
npm run dev examples/telemetry-demo.ts

# With Jaeger (start Jaeger first)
docker run -d --name jaeger -p 16686:16686 -p 14268:14268 jaegertracing/all-in-one:latest
npm run dev examples/telemetry-demo.ts
# Open http://localhost:16686 to view traces
```

#### Best Practices

1. **Production Setup**: Use appropriate exporters for your infrastructure (Jaeger, Zipkin, Cloud providers)
2. **Sampling**: Configure sampling strategies to control trace volume in production
3. **Context Propagation**: OpenTelemetry automatically propagates trace context across agent calls
4. **Custom Attributes**: Extend traces with custom attributes specific to your use case
5. **Performance**: Telemetry adds minimal overhead when properly configured

### ACE Support (Agentic Context Engineering)

AxCrew integrates [Agentic Context Engineering (ACE)](https://www.youtube.com/watch?v=elgYgPo_vY4) from the Ax framework, enabling agents to learn and improve from human feedback. ACE maintains a "playbook" of learned rules that guide agent behavior, which can be persisted across sessions.

#### Key Features

- **Online Learning**: Agents learn from real-time feedback during conversations
- **Playbook Persistence**: Save learned rules to JSON files or custom storage
- **Teacher/Student Model**: Use a separate "teacher" LLM to distill feedback into actionable rules
- **Feedback Routing**: Distribute feedback across agent dependency chains automatically

#### Configuration

Add the `ace` field to any agent configuration:

```typescript
{
  name: "SupportAgent",
  description: "Customer support agent",
  signature: "ticket:string -> supportResponse:string, decision:string",
  provider: "google-gemini",
  providerKeyName: "GEMINI_API_KEY",
  ai: { model: "gemini-flash-latest", temperature: 0.7 },
  ace: {
    teacher: {
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-flash-latest" }
    },
    options: {
      maxEpochs: 1,
      allowDynamicSections: true
    },
    persistence: {
      playbookPath: "playbooks/support-agent.json",
      autoPersist: true
    },
    metric: {
      primaryOutputField: "supportResponse"
    }
  }
}
```

#### ACE Configuration Options

| Field | Type | Description |
|-------|------|-------------|
| `teacher` | object | Teacher model config (provider, model, apiURL) |
| `persistence.playbookPath` | string | File path to save/load playbook |
| `persistence.autoPersist` | boolean | Auto-save playbook after updates |
| `persistence.onPersist` | function | Custom callback for saving playbook |
| `persistence.onLoad` | function | Custom callback for loading playbook |
| `options.maxEpochs` | number | Training epochs for offline compile |
| `options.allowDynamicSections` | boolean | Allow playbook to create new sections |
| `metric.primaryOutputField` | string | Output field to evaluate for quality |
| `compileOnStart` | boolean | Run offline compile on agent init |

#### Usage: Applying Feedback

```typescript
import { AxCrew, AxCrewFunctions } from '@amitdeshmukh/ax-crew';

const crew = new AxCrew(config, AxCrewFunctions);
await crew.addAgentsToCrew(['SupportAgent']);

const agent = crew.agents.get('SupportAgent');

// Run the agent
const result = await agent.forward({ ticket: "Customer wants refund after 45 days" });
const taskId = result._taskId;

// Apply feedback to teach the agent
await crew.applyTaskFeedback({
  taskId,
  feedback: "For loyal customers (5+ years), extend return window to 60 days",
  strategy: "all"  // Apply to all agents involved in this task
});

// View the learned playbook
const playbook = agent.getPlaybook?.();
console.log(playbook);
```

#### Feedback Strategies

| Strategy | Description |
|----------|-------------|
| `"all"` | Apply feedback to all agents involved in the task |
| `"primary"` | Apply only to the primary (entry) agent |
| `"leaf"` | Apply only to leaf agents (no sub-agents) |

#### Examples

See the ACE examples for complete demonstrations:

- [`ace-customer-support.ts`](examples/ace-customer-support.ts) - Learn edge-case handling beyond standard policies
- [`ace-feedback-routing.ts`](examples/ace-feedback-routing.ts) - Flight assistant with preference learning

```bash
# Run the customer support demo
npx tsx examples/ace-customer-support.ts
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes and version updates.