import type { 
  AxFunction, 
  AxSignature, 
  AxModelConfig,
  AxProgramForwardOptions
} from '@ax-llm/ax';

import type { Provider } from './agents/agentConfig.js';

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
 * promptTokens: number;
 * completionTokens: number;
 */
interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
}

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

interface MCPHTTPTransportConfig {
  sseUrl: string
}
/**
 * Config for an MCP server.
 * 
 * @property {MCPStdioTransportConfig | MCPHTTPTransportConfig} config - The config for the MCP server. Config can be either a stdio or http transport.
 */
type MCPTransportConfig = MCPStdioTransportConfig | MCPHTTPTransportConfig

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
 * @property {Partial<AxProgramForwardOptions>} options - Agent options including thinkingTokenBudget, showThoughts, etc. Refer to the Ax documentation for more details.
 * @property {string[]} functions - Function names to be used by the agent.
 * @property {string[]} agents - Sub-agent available to the agent.
 * @property {Record<string, any>[]} examples - DSPy examples for the agent to learn from.
 * @property {Record<string, MCPTransportConfig>} mcpServers - MCP servers configuration.
 */
interface AgentConfig {
  name: string;
  description: string;
  signature: string | AxSignature;
  provider: Provider;
  providerKeyName?: string;
  ai: AxModelConfig & { model: string };
  debug?: boolean;
  apiURL?: string;
  options?: Partial<AxProgramForwardOptions>;
  functions?: string[];
  agents?: string[];
  examples?: Array<Record<string, any>>;
  mcpServers?: Record<string, MCPTransportConfig>;
}

/**
 * The input type for the agent config. This can be a path to a JSON file or a JSON object.
 */
type CrewConfigInput = string | { crew: AgentConfig[] };

export {
  type AgentConfig,
  type CrewConfigInput,
  type AggregatedMetrics,
  type StateInstance,
  type FunctionRegistryType,
  type MCPStdioTransportConfig,
  type MCPHTTPTransportConfig,
  type MCPTransportConfig,
  type ModelUsage,
  type ModelInfo,
  type UsageCost,
  type AggregatedCosts
};
