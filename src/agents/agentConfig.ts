import fs from 'fs';
import { AxAIAnthropic, AxAIOpenAI, AxAIAzureOpenAI, AxAICohere, AxAIDeepSeek, AxAIGoogleGemini, AxAIGroq, AxAIHuggingFace, AxAIMistral, AxAIOllama, AxAITogether } from '@ax-llm/ax';
import type { AxModelConfig, AxFunction, AxSignature } from '@ax-llm/ax';

import { PROVIDER_API_KEYS } from '../config/index.js';
import { FunctionRegistryType } from '../functions/index.js';

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



export interface AgentConfig {
  name: string;
  description: string;
  signature: string | AxSignature;
  provider: string;
  providerKeyName?: string;
  ai: AxModelConfig & { model: string };
  debug?: boolean;
  apiURL?: string;
  options?: Record<string, any>;
  functions?: string[];
  agents?: string[];
  examples?: Array<Record<string, any>>;
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

type AgentConfigInput = string | { crew: AgentConfig[] };

/**
 * Reads the AI parameters from either a JSON configuration file or a direct JSON object.
 * @param {AgentConfigInput} input - Either a path to the agent_config.json file or a JSON object with crew configuration.
 * @returns {Object} The parsed agent configs.
 * @throws Will throw an error if reading/parsing fails.
 */
const parseAgentConfig = (input: AgentConfigInput): { crew: AgentConfig[] } => {
  try {
    if (typeof input === 'string') {
      // Handle file path input
      const fileContents = fs.readFileSync(input, 'utf8');
      const parsedConfigs = JSON.parse(fileContents) as { crew: AgentConfig[] };
      return parsedConfigs;
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
 * Initializes the AI agent using the specified agent name and configuration.
 * This function parses the agent's configuration, validates the presence of the necessary API key,
 * and creates an instance of the AI agent with the appropriate settings.
 *
 * @param {string} agentName - The identifier for the AI agent to be initialized.
 * @param {AgentConfigInput} agentConfig - Either a file path to the JSON configuration or a JSON object with crew configuration.
 * @param {FunctionRegistryType} functions - The functions available to the agent.
 * @param {Object} state - The state object for the agent.
 * @returns {Object} An object containing the Agents AI instance, its name, description, signature, functions and subAgentList.
 * @throws {Error} Throws an error if the agent configuration is missing, the provider is unsupported,
 * the API key is not found, or the provider key name is not specified in the configuration.
 */
const getAgentConfigParams = (
  agentName: string, 
  agentConfig: AgentConfigInput,
  functions: FunctionRegistryType,
  state: Record<string, any>
) => {
  try {
    // Retrieve the parameters for the specified AI agent from config
    const agentConfigData = parseAgentConfig(agentConfig).crew.find(agent => agent.name === agentName);
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
      ai.setAPIURL(agentConfigData.apiURL);
    }
    
    // Prepare functions for the AI agent
    const agentFunctions = (agentConfigData.functions || [])
      .map(funcName => {
        const func = functions[funcName];
        if (!func) {
          console.warn(`Warning: Function ${funcName} not found.`);
          return;
        }

        // Use the type guard to check if the function is a class
        if (isConstructor<{ toFunction: () => AxFunction }>(func)) {
          return new func(state).toFunction();
        }

        // Else the function is a function handler, return it directly
        return func;
      })
      .filter(Boolean);

    // Return AI instance and Agent parameters
    return {
      ai,
      name: agentName,
      description: agentConfigData.description,
      signature: agentConfigData.signature,
      functions: agentFunctions,
      subAgentNames: agentConfigData.agents || [],
      examples: agentConfigData.examples || []
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Error setting up AI agent: ${error}`);
  }
};

export { getAgentConfigParams, AgentConfigInput };