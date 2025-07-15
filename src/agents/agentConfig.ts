import fs from 'fs';
// Import all the providers
import { AxAIAnthropic, AxAIOpenAI, AxAIAzureOpenAI, AxAICohere, AxAIDeepSeek, AxAIGoogleGemini, AxAIGroq, AxAIHuggingFace, AxAIMistral, AxAIOllama, AxAITogether } from '@ax-llm/ax';
// Import Ax types
import type { AxFunction } from '@ax-llm/ax';
// Import the MCP client and transports
import { AxMCPClient, AxMCPHTTPSSETransport } from '@ax-llm/ax'
import { AxMCPStdioTransport } from '@ax-llm/ax-tools'
import { PROVIDER_API_KEYS } from '../config/index.js';
import type { 
  AgentConfig,
  CrewConfigInput,
  FunctionRegistryType, 
  MCPTransportConfig, 
  MCPStdioTransportConfig, 
  MCPHTTPTransportConfig 
} from '../types.js';

// Define a mapping from provider names to their respective constructors
const AIConstructors: Record<string, any> = {
  'anthropic': AxAIAnthropic,
  'azure-openai': AxAIAzureOpenAI,
  'cohere': AxAICohere,
  'deepseek': AxAIDeepSeek,
  'google-gemini': AxAIGoogleGemini,
  'groq': AxAIGroq,
  'huggingFace': AxAIHuggingFace,
  'mistral': AxAIMistral,
  'ollama': AxAIOllama,
  'openai': AxAIOpenAI,
  'together': AxAITogether
};

// Provider type
export type Provider = keyof typeof AIConstructors;

// Type guard to check if config is stdio transport
export function isStdioTransport(config: MCPTransportConfig): config is MCPStdioTransportConfig {
  return 'command' in config;
}

// Type guard to check if config is http transport
export function isHTTPTransport(config: MCPTransportConfig): config is MCPHTTPTransportConfig {
  return 'sseUrl' in config;
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
      } else if (isHTTPTransport(mcpServerConfig)) {
        transport = new AxMCPHTTPSSETransport(mcpServerConfig.sseUrl);
      } else {  
        throw new Error(`Unsupported transport type: ${mcpServerConfig}`);
      }

      const mcpClient = new AxMCPClient(transport, {debug: agentConfigData.debug || false});
      await mcpClient.init();
      initializedClients.push(mcpClient);
      functions.push(...mcpClient.toFunction());
    }
    
    return functions;
  } catch (error) {
    initializedClients = [];
    console.error('Error during MCP client setup:', error);
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

    // Get the constructor for the AI agent's provider
    const AIConstructor = AIConstructors[agentConfigData.provider];
    if (!AIConstructor) {
      throw new Error(`AI provider ${agentConfigData.provider} is not supported. Did you mean '${agentConfigData.provider.toLowerCase()}'?`);
    }

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

    // Create an instance of the AI agent and set options
    const ai = new AIConstructor({
      apiKey,
      config: agentConfigData.ai,
      options: {
        debug: agentConfigData.debug || false,
        ...agentConfigData.options
      }
    });
    // If an apiURL is provided in the agent config, set it in the AI agent
    if (agentConfigData.apiURL) {
      try {
        // Validate apiURL format
        new URL(agentConfigData.apiURL);
        ai.setAPIURL(agentConfigData.apiURL);
      } catch (error) {
        throw new Error(`Invalid apiURL provided: ${agentConfigData.apiURL}`);
      }      
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
      ai,
      name: agentName,
      description: agentConfigData.description,
      signature: agentConfigData.signature,
      functions: agentFunctions,
      subAgentNames: agentConfigData.agents || [],
      examples: agentConfigData.examples || [],
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