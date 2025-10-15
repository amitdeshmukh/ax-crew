import fs from 'fs';
// Import Ax factory and MCP transports (as exported by current package)
import { ai, AxMCPClient, AxMCPHTTPSSETransport, AxMCPStreambleHTTPTransport, AxDefaultCostTracker } from '@ax-llm/ax'
import type {
  AxAIAzureOpenAIArgs,
  AxAIAnthropicArgs,
  AxAIGoogleGeminiArgs,
  AxAIOpenRouterArgs,
  AxAIOllamaArgs
} from '@ax-llm/ax';
import type { AxFunction } from '@ax-llm/ax';
// STDIO transport from tools package
import { AxMCPStdioTransport } from '@ax-llm/ax-tools'
import { PROVIDER_API_KEYS } from '../config/index.js';
import type { 
  AgentConfig,
  CrewConfigInput,
  FunctionRegistryType, 
  MCPTransportConfig, 
  MCPStdioTransportConfig, 
  MCPHTTPSSETransportConfig,
  MCPStreamableHTTPTransportConfig
} from '../types.js';
import type { Provider } from '../types.js';

// Canonical provider slugs supported by ai() factory
const PROVIDER_CANONICAL = new Set([
  'openai',
  'anthropic',
  'google-gemini',
  'mistral',
  'groq',
  'cohere',
  'together',
  'deepseek',
  'ollama',
  'huggingface',
  'openrouter',
  'azure-openai',
  'reka',
  'x-grok'
]);

// Provider type lives in src/types.ts

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

/**
 * Provides a user-friendly error message for JSON parsing errors
 */
const getFormattedJSONError = (error: Error, fileContents: string): string => {
  if (error instanceof SyntaxError) {
    const match = error.message.match(/position (\d+)/);
    const position = match ? parseInt(match[1]) : -1;
    
    if (position !== -1) {
      const lines = fileContents.split('\n');
      let currentPos = 0;
      let errorLine = 0;
      let errorColumn = 0;

      // Find the line and column of the error
      for (let i = 0; i < lines.length; i++) {
        if (currentPos + lines[i].length >= position) {
          errorLine = i + 1;
          errorColumn = position - currentPos + 1;
          break;
        }
        currentPos += lines[i].length + 1; // +1 for the newline character
      }

      const contextLines = lines.slice(Math.max(0, errorLine - 3), errorLine + 2)
        .map((line, idx) => `${errorLine - 2 + idx}:  ${line}`).join('\n');

      return `JSON Parse Error in your agent configuration:
      
Error near line ${errorLine}, column ${errorColumn}

Context:
${contextLines}

Common issues to check:
- Missing or extra commas between properties
- Missing quotes around property names
- Unmatched brackets or braces
- Invalid JSON values
- Trailing commas (not allowed in JSON)

Original error: ${error.message}`;
    }
  }
  
  return `Error parsing agent configuration: ${error.message}`;
};

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
 * Parses and returns the AxCrew config from either a JSON config file or a direct JSON object.
 * @param {CrewConfigInput} input - Either a path to the agent config json file or a JSON object with crew configuration.
 * @returns {Object} The parsed crew config.
 * @throws Will throw an error if reading/parsing fails.
 */
const parseCrewConfig = (input: CrewConfigInput): { crew: AgentConfig[] } => {
  try {
    if (typeof input === 'string') {
      // Handle file path input
      const fileContents = fs.readFileSync(input, 'utf8');
      const parsedConfig = JSON.parse(fileContents) as { crew: AgentConfig[] };
      return parsedConfig;
    } else {
      // Handle direct JSON object input
      return input;
    }
  } catch (e) {
    if (e instanceof Error) {
      if (typeof input === 'string') {
        const formattedError = getFormattedJSONError(e, fs.readFileSync(input, 'utf8'));
        throw new Error(formattedError);
      }
      throw new Error(`Error parsing agent configuration: ${e.message}`);
    }
    throw e;
  }
};

/**
 * Parses the agent's configuration, validates the presence of the necessary API key,
 * and creates an instance of the Agent with the appropriate settings.
 *
 * @param {string} agentName - The identifier for the AI agent to be initialized.
 * @param {CrewConfigInput} crewConfig - Either a file path to the JSON configuration or a JSON object with crew configuration.
 * @param {FunctionRegistryType} functions - The functions available to the agent.
 * @param {Object} state - The state object for the agent.
 * @returns {Object} An object containing the Agents AI instance, its name, description, signature, functions and subAgentList.
 * @throws {Error} Throws an error if the agent configuration is missing, the provider is unsupported,
 * the API key is not found, or the provider key name is not specified in the configuration.
 */
const parseAgentConfig = async (
  agentName: string, 
  crewConfig: CrewConfigInput,
  functions: FunctionRegistryType,
  state: Record<string, any>
) => {
  try {
    // Retrieve the parameters for the specified AI agent from config
    const agentConfigData = parseCrewConfig(crewConfig).crew.find(agent => agent.name === agentName);
    if (!agentConfigData) {
      throw new Error(`AI agent with name ${agentName} is not configured`);
    }

    // Enforce canonical provider slug
    const lower = agentConfigData.provider.toLowerCase();
    if (!PROVIDER_CANONICAL.has(lower)) {
      throw new Error(`AI provider ${agentConfigData.provider} is not supported. Use one of: ${Array.from(PROVIDER_CANONICAL).join(', ')}`);
    }
    const provider = lower as Provider;

    // If an API Key property is present, get the API key for the AI agent from the environment variables
    let apiKey = '';
    if (agentConfigData.providerKeyName) {
      apiKey = PROVIDER_API_KEYS[agentConfigData.providerKeyName] || '';

      if (!apiKey) {
        throw new Error(`API key for provider ${agentConfigData.provider} is not set in environment variables`);
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
        trackers: [costTracker]
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
    // Forward provider-specific arguments with type-safety for Azure OpenAI
    const providerArgs = (agentConfigData as any).providerArgs;
    if (provider === 'azure-openai') {
      type AzureArgs = Pick<AxAIAzureOpenAIArgs<string>, 'resourceName' | 'deploymentName' | 'version'>;
      const az: Partial<AzureArgs> = providerArgs ?? {};
      // If users supplied apiURL instead of resourceName, accept it (Ax supports full URL as resourceName)
      if (!az.resourceName && agentConfigData.apiURL) {
        az.resourceName = agentConfigData.apiURL as any;
      }
      Object.assign(aiArgs, az);
    } else if (provider === 'anthropic') {
      type AnthropicArgs = Pick<AxAIAnthropicArgs<string>, 'projectId' | 'region'>;
      const an: Partial<AnthropicArgs> = providerArgs ?? {};
      Object.assign(aiArgs, an);
    } else if (provider === 'google-gemini') {
      type GeminiArgs = Pick<AxAIGoogleGeminiArgs<string>, 'projectId' | 'region' | 'endpointId'>;
      const g: Partial<GeminiArgs> = providerArgs ?? {};
      Object.assign(aiArgs, g);
    } else if (provider === 'openrouter') {
      type OpenRouterArgs = Pick<AxAIOpenRouterArgs<string>, 'referer' | 'title'>;
      const o: Partial<OpenRouterArgs> = providerArgs ?? {};
      Object.assign(aiArgs, o);
    } else if (provider === 'ollama') {
      type OllamaArgs = Pick<AxAIOllamaArgs<string>, 'url'>;
      const ol: Partial<OllamaArgs> = providerArgs ?? {};
      Object.assign(aiArgs, ol);
    } else if (providerArgs && typeof providerArgs === 'object') {
      // Generic pass-through for other providers if needed in the future
      Object.assign(aiArgs, providerArgs);
    }
    const aiInstance = ai(aiArgs);

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