import type { 
  AxFunction, 
  AxSignature, 
  AxModelConfig,
  AxMCPStreamableHTTPTransportOptions,
  AxProgramForwardOptions,
  AxAIArgs
} from '@ax-llm/ax';

// Provider ids are derived from Ax's factory arg type so new providers added in Ax
// are picked up at compile time without updating AxCrew.
export type Provider = AxAIArgs<any>['name'];

/**
 * A state instance that is shared between agents.
 * This can be used to store data that becomes available to all agents and functions in an out-of-band manner.
 * 
 * @typedef {Object} StateInstance
 * @property {Function} reset - Reset the state.
 * @property {Function} set - Set a value in the state.
 * @property {Function} get - Get a value from the state.
 * @property {Function} getAll - Get all the values from the state.
 */
interface StateInstance {
  reset(): void;
  set(key: string, value: any): void;
  get(key: string): any;
  getAll(): Record<string, any>;
  [key: string]: any;
}

/**
 * A registry of functions that can be used by agents.
 * 
 * @typedef {Object} FunctionRegistryType
 * @property {[key: string]: AxFunction | { new(state: Record<string, any>): { toFunction: () => AxFunction } }} [key: string] - A function or a constructor for a function that can be used by agents.
 */
type FunctionRegistryType = {
  [key: string]: AxFunction | { new(state: Record<string, any>): { toFunction: () => AxFunction } };
};

/**
 * The usage metrics of the model.
 * Supports both direct token properties and nested tokens structure
 */
interface ModelUsageBase {
  promptTokens?: number;
  completionTokens?: number;
}

interface ModelUsageNested {
  ai?: string;
  model?: string;
  tokens?: {
    totalTokens?: number;
    promptTokens: number;
    completionTokens: number;
  };
}

type ModelUsage = ModelUsageBase & ModelUsageNested;

/**
 * The published cost for using the model.
 * promptTokenCostPer1M: number;
 * completionTokenCostPer1M: number;
 */
interface ModelInfo {
  promptTokenCostPer1M: number;
  completionTokenCostPer1M: number;
}

/**
 * The cost incurred for using the model.
 * 
 */
interface UsageCost {
  promptCost: string;
  completionCost: string;
  totalCost: string;
  tokenMetrics: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }
}

/**
 * Aggregated metrics from all agent and sub-agent invocations.
 * 
 */
interface AggregatedMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCost: string;
  completionCost: string;
}

/**
 * The incurred costs from all agent and sub-agent invocations.
 * 
 */
interface AggregatedCosts {
  totalCost: string;
  byAgent: Record<string, UsageCost>;
  aggregatedMetrics: AggregatedMetrics;
}

/**
 * Config for an STDIO MCP server.
 * 
 * @property {string} command - The command to run the MCP server.
 * @property {string[]} args - Arguments to pass to the MCP server.
 * @property {NodeJS.ProcessEnv} env - Environment variables to pass to the MCP server.
 */
interface MCPStdioTransportConfig {
  command: string
  args?: string[]
  env?: NodeJS.ProcessEnv
}

/**
 * Config for an HTTP SSE MCP server.
 * 
 * @property {string} sseUrl - The SSE URL for the MCP server.
 */
interface MCPHTTPSSETransportConfig {
  sseUrl: string
}

/**
 * Config for a streamable HTTP MCP server.
 * 
 * @property {string} mcpEndpoint - The HTTP endpoint URL for the MCP server.
 * @property {AxMCPStreamableHTTPTransportOptions} options - Optional transport options.
 */
interface MCPStreamableHTTPTransportConfig {
  mcpEndpoint: string
  options?: AxMCPStreamableHTTPTransportOptions
}

/**
 * Config for an MCP server.
 * 
 * @property {MCPStdioTransportConfig | MCPHTTPSSETransportConfig | MCPStreambleHTTPTransportConfig} config - The config for the MCP server. Config can be either stdio, http-sse, or streamable http transport.
 */
type MCPTransportConfig = MCPStdioTransportConfig | MCPHTTPSSETransportConfig | MCPStreamableHTTPTransportConfig

/**
 * The configuration for an agent.
 * 
 * @property {string} name - Name of the agent.
 * @property {string} description - Description of the agent.
 * @property {string | AxSignature} signature - The signature for the agent in DSPy format.
 * @property {Provider} provider - LLM provider name.
 * @property {string} providerKeyName - The name of the provider key (read from environment variables).
 * @property {AxModelConfig & { model: string }} ai - The AI model configuration to be passed to the agent.
 * @property {boolean} debug - Whether to enable debug mode.
 * @property {string} apiURL - Set this if you are using a custom API URL e.g. ollama on localhost.
 * @property {Partial<AxProgramForwardOptions<any>> & Record<string, any>} options - Agent options including thinkingTokenBudget, showThoughts, etc. Also allows arbitrary provider-specific keys.
 * @property {string[]} functions - Function names to be used by the agent.
 * @property {string[]} agents - Sub-agent available to the agent.
 * @property {Record<string, any>[]} examples - DSPy examples for the agent to learn from.
 * @property {Record<string, MCPTransportConfig>} mcpServers - MCP servers configuration.
 */
interface AgentConfig {
  name: string;
  description: string;
  /**
   * Optional detailed persona/program definition. If provided, becomes the system prompt.
   * Must be at least 100 characters per Ax semantics.
   */
  definition?: string;
  /**
   * Optional alias for definition for clarity. If provided and definition is omitted,
   * this will be used as the program definition/system prompt.
   */
  prompt?: string;
  signature: string | AxSignature;
  provider: Provider;
  providerKeyName?: string;
  ai: AxModelConfig & { model: string };
  debug?: boolean;
  apiURL?: string;
  /**
   * Provider-specific arguments that are forwarded to the underlying Ax factory.
   * Example (azure-openai): { resourceName, deploymentName, version }
   */
  providerArgs?: Record<string, unknown>;
  options?: Partial<AxProgramForwardOptions<any>> & Record<string, any>;
  functions?: string[];
  agents?: string[];
  examples?: Array<Record<string, any>>;
  mcpServers?: Record<string, MCPTransportConfig>;
}

/**
 * The configuration object for an AxCrew instance.
 * 
 * @property {AgentConfig[]} crew - The agents that make up the crew.
 * @example
 * const config: AxCrewConfig = {
 *   crew: [
 *     {
 *       name: "Agent1",
 *       description: "Agent 1 description",
 *       signature: "signature",
 *       provider: "provider",
 *       providerKeyName: "providerKeyName",
 *       ai: {
 *         model: "model",
 *         temperature: 0,
 *       },
 *       options: {
 *         debug: true,
 *       },
 *       functions: ["function1", "function2"],
 *       agents: ["agent2"],
 *     },
 *     {
 *       name: "Agent2",
 *       description: "Agent 2 description",
 *       signature: "signature",
 *       provider: "provider",
 *       providerKeyName: "providerKeyName",
 *       ai: {
 *         model: "model",
 *         temperature: 0,
 *       }
 *   ]
 * }
 * const crew = new AxCrew(config);
 */
interface AxCrewConfig {
  crew: AgentConfig[]
}

export {
  type AgentConfig,
  type AxCrewConfig,
  type AggregatedMetrics,
  type StateInstance,
  type FunctionRegistryType,
  type MCPStdioTransportConfig,
  type MCPHTTPSSETransportConfig,
  type MCPStreamableHTTPTransportConfig,
  type MCPTransportConfig,
  type ModelUsage,
  type ModelInfo,
  type UsageCost,
  type AggregatedCosts
}
