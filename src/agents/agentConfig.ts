// Import Ax factory and MCP transports
import { ai, AxMCPClient, AxMCPHTTPSSETransport, AxMCPStreambleHTTPTransport, AxDefaultCostTracker } from '@ax-llm/ax'
import type { AxFunction } from '@ax-llm/ax';
// STDIO transport from tools package
import { AxMCPStdioTransport } from '@ax-llm/ax-tools'
// Resolve env by provided key name
import type { 
  AgentConfig,
  AxCrewConfig,
  AxCrewOptions,
  FunctionRegistryType, 
  MCPTransportConfig, 
  MCPStdioTransportConfig, 
  MCPHTTPSSETransportConfig,
  MCPStreamableHTTPTransportConfig
} from '../types.js';
import type { Provider } from '../types.js';

// Type guard to check if config is stdio transport
export function isStdioTransport(config: MCPTransportConfig): config is MCPStdioTransportConfig {
  return 'command' in config;
}

// Type guard to check if config is HTTP SSE transport (also handles legacy HTTP transport)
export function isHTTPSSETransport(config: MCPTransportConfig): config is MCPHTTPSSETransportConfig {
  return 'sseUrl' in config;
}

// Type guard to check if config is streamable HTTP transport
export function isStreambleHTTPTransport(config: MCPTransportConfig): config is MCPStreamableHTTPTransportConfig {
  return 'mcpEndpoint' in config;
}

/**
 * Type guard to check if a value is a constructor function for a type T.
 * 
 * @template T - The type to check the constructor against.
 * @param {any} func - The value to check.
 * @returns {boolean} - True if the value is a constructor function for type T, false otherwise.
 */
function isConstructor<T>(func: any): func is { new (...args: any[]): T } {
  return typeof func === 'function' && 'prototype' in func && 'toFunction' in func.prototype;
}

// Removed file/JSON parse helpers to keep browser-safe

const initializeMCPServers = async (agentConfigData: AgentConfig): Promise<AxFunction[]> => {
  const mcpServers = agentConfigData.mcpServers;
  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return [];
  }

  let initializedClients: AxMCPClient[] = [];
  const functions: AxFunction[] = [];
  
  try {
    for (const [mcpServerName, mcpServerConfig] of Object.entries(mcpServers)) {
      let transport;
      if (isStdioTransport(mcpServerConfig)) {
        transport = new AxMCPStdioTransport({
          command: mcpServerConfig.command,
          args: mcpServerConfig.args,
          env: mcpServerConfig.env
        });
      } else if (isHTTPSSETransport(mcpServerConfig)) {
        transport = new AxMCPHTTPSSETransport(mcpServerConfig.sseUrl);
      } else if (isStreambleHTTPTransport(mcpServerConfig)) {
        transport = new AxMCPStreambleHTTPTransport(mcpServerConfig.mcpEndpoint, mcpServerConfig.options);
      } else {  
        throw new Error(`Unsupported transport type: ${JSON.stringify(mcpServerConfig)}`);
      }

      const mcpClient = new AxMCPClient(transport, {debug: agentConfigData.debug || false});
      await mcpClient.init();
      initializedClients.push(mcpClient);
      functions.push(...mcpClient.toFunction());
    }
    
    return functions;
  } catch (error) {
    initializedClients = [];
    console.error(`Error during MCP client setup: ${error}`);
    throw error;
  }
};

/**
 * Returns the AxCrew config from a direct JSON object. Browser-safe.
 * @param {CrewConfig} input - A JSON object with crew configuration.
 * @returns {Object} The parsed crew config.
 * @throws Will throw an error if reading/parsing fails.
 */
const parseCrewConfig = (input: AxCrewConfig): { crew: AgentConfig[] } => {
  if (!input || typeof input !== 'object' || !Array.isArray((input as any).crew)) {
    throw new Error('Invalid crew configuration: expected an object with a crew array');
  }
  return input as { crew: AgentConfig[] };
};

/**
 * Parses the agent's configuration, validates the presence of the necessary API key,
 * and creates an instance of the Agent with the appropriate settings.
 *
 * @param {string} agentName - The identifier for the AI agent to be initialized.
 * @param {AxCrewConfig} crewConfig - A JSON object with crew configuration.
 * @param {FunctionRegistryType} functions - The functions available to the agent.
 * @param {Object} state - The state object for the agent.
 * @returns {Object} An object containing the Agents AI instance, its name, description, signature, functions and subAgentList.
 * @throws {Error} Throws an error if the agent configuration is missing, the provider is unsupported,
 * the API key is not found, or the provider key name is not specified in the configuration.
 */
const parseAgentConfig = async (
  agentName: string, 
  crewConfig: AxCrewConfig,
  functions: FunctionRegistryType,
  state: Record<string, any>,
  options?: AxCrewOptions
) => {
  try {
    // Retrieve the parameters for the specified AI agent from config
    const agentConfigData = parseCrewConfig(crewConfig).crew.find(agent => agent.name === agentName);
    if (!agentConfigData) {
      throw new Error(`AI agent with name ${agentName} is not configured`);
    }

    // Normalize provider slug to lowercase and validate via Ax factory
    const lower = String(agentConfigData.provider).toLowerCase() as Provider;
    const provider = lower as Provider;

    // Resolve API key from user-supplied environment variable name
    let apiKey = '';
    if (agentConfigData.providerKeyName) {
      const keyName = agentConfigData.providerKeyName;
      apiKey = resolveApiKey(keyName) || '';
      if (!apiKey) {
        throw new Error(`API key '${keyName}' for provider ${agentConfigData.provider} is not set in environment`);
      }
    } else {
      throw new Error(`Provider key name is missing in the agent configuration`);
    }

    // Create a cost tracker instance and pass to ai()
    const costTracker = new AxDefaultCostTracker(((agentConfigData as any).options?.costTracking) || undefined);

    // Create an instance of the AI agent via factory
    const aiArgs: any = {
      name: provider,
      apiKey,
      config: agentConfigData.ai,
      options: {
        debug: agentConfigData.debug || false,
        ...agentConfigData.options,
        // Attach default cost tracker so usage/costs are recorded by provider layer
        trackers: [costTracker],
        // Inject telemetry if provided
        tracer: options?.telemetry?.tracer,
        meter: options?.telemetry?.meter
      }
    };
    if (agentConfigData.apiURL) {
      try {
        new URL(agentConfigData.apiURL);
        aiArgs.apiURL = agentConfigData.apiURL;
      } catch (error) {
        throw new Error(`Invalid apiURL provided: ${agentConfigData.apiURL}`);
      }
    }
    // Forward provider-specific arguments as-is; let Ax validate/ignore as needed
    const providerArgs = (agentConfigData as any).providerArgs;
    if (providerArgs && typeof providerArgs === 'object') {
      Object.assign(aiArgs, providerArgs);
    }
    // Validate provider by attempting instantiation; Ax will throw on unknown providers
    let aiInstance;
    try {
      aiInstance = ai(aiArgs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Unsupported provider '${provider}': ${msg}`);
    }

    // If an mcpServers config is provided in the agent config, convert to functions
    const mcpFunctions = await initializeMCPServers(agentConfigData);

    // Prepare functions for the AI agent
    const agentFunctions = [
      // Add custom functions
      ...(agentConfigData.functions || [])
        .map(funcName => {
          const func = functions[funcName];
          if (!func) {
            console.warn(`Warning: Function ${funcName} not found.`);
            return;
          }
          return func;
        })
        .filter((func): func is AxFunction => func !== null),
      // Add MCP functions to functions
      ...mcpFunctions
    ];
    
    // Return AI instance and Agent parameters
    return {
      ai: aiInstance,
      name: agentName,
      description: agentConfigData.description,
      definition: (agentConfigData as any).definition ?? (agentConfigData as any).prompt,
      signature: agentConfigData.signature,
      functions: agentFunctions,
      subAgentNames: agentConfigData.agents || [],
      examples: agentConfigData.examples || [],
      tracker: costTracker,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Error setting up AI agent: ${error}`);
  }
};

export { 
  parseAgentConfig,
  parseCrewConfig
};

function resolveApiKey(varName: string): string | undefined {
  try {
    // Prefer Node env when available
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (typeof process !== 'undefined' && process?.env) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return process.env[varName];
    }
    // Fallback: allow global exposure in browser builds (e.g., injected at runtime)
    return (globalThis as any)?.[varName];
  } catch {
    return undefined;
  }
}