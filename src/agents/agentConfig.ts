import fs from 'fs';
import yaml from 'js-yaml';

import { AxAIAnthropic, AxAIOpenAI, AxAIAzureOpenAI, AxAICohere, AxAIDeepSeek, AxAIGoogleGemini, AxAIGroq, AxAIHuggingFace, AxAIMistral, AxAIOllama, AxAITogether } from '@ax-llm/ax';
import type { AxAI, AxModelConfig, AxFunction, AxSignature } from '@ax-llm/ax';

import { PROVIDER_API_KEYS } from '../config/index.js';
import { AxCrewFunctions } from '../functions/index.js';

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

type ExtendedAxModelConfig = AxModelConfig & {
  model: string;
};

// Define a mapping from function names to their respective handlers
type FunctionMap = {
  [key: string]: AxFunction | { new(state: Record<string, any>): { toFunction: () => AxFunction } };
};

const functions: FunctionMap = AxCrewFunctions;

interface AgentConfig {
  name: string;
  description: string;
  signature: AxSignature;
  provider: string;
  provider_key_name?: string;
  ai: ExtendedAxModelConfig;
  debug?: boolean;
  apiURL?: string;
  options?: Record<string, any>;
  functions?: string[];
  agents?: string[];
}

interface Agent {
  ai: AxAI;
  name: string;
  description: string;
  signature?: AxSignature;
  functions: AxFunction[];
  subAgentNames: string[];
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
 * Reads the AI parameters from the YAML configuration file.
 * @param {string} agentConfigFilePath - The path to the agent_config.yaml file.
 * @returns {Object} The parsed agent configs from the config.yaml file.
 * @throws Will throw an error if reading the file fails.
 */
const parseAgentConfig = (agentConfigFilePath: string): {crew: AgentConfig[]} => {
  try {
    const fileContents = fs.readFileSync(agentConfigFilePath, 'utf8');
    const parsedConfigs = yaml.load(fileContents) as { crew: AgentConfig[] };
    return parsedConfigs;
  } catch (e) {
    console.error('Error reading agent config file:', e);
    throw e;
  }
};

/**
 * Initializes the AI agent using the specified agent name and configuration file path.
 * This function parses the agent's configuration, validates the presence of the necessary API key,
 * and creates an instance of the AI agent with the appropriate settings.
 *
 * @param {string} agentName - The identifier for the AI agent to be initialized.
 * @param {string} agentConfigFilePath - The file path to the YAML configuration for the agent.
 * @param {Object} state - The state object for the agent.
 * @returns {Object} An object containing the Agents AI instance, its name, description, signature, functions and subAgentList.
 * @throws {Error} Throws an error if the agent configuration is missing, the provider is unsupported,
 * the API key is not found, or the provider key name is not specified in the configuration.
 */
const getAgentConfigParams = (
  agentName: string, 
  agentConfigFilePath: string, 
  state: Record<string, any>
) => {
  try{
    // Retrieve the parameters for the specified AI agent from a config file in yaml format
    const agentConfig = parseAgentConfig(agentConfigFilePath).crew.find(agent => agent.name === agentName);
    if (!agentConfig) {
      throw new Error(`AI agent with name ${agentName} is not configured`);
    }

    // Get the constructor for the AI agent's provider
    const AIConstructor = AIConstructors[agentConfig.provider];
    if (!AIConstructor) {
      throw new Error(`AI provider ${agentConfig.provider} is not supported. Did you mean '${agentConfig.provider.toLowerCase()}'?`);
    }

    // If an API Key property is present, get the API key for the AI agent from the environment variables
    let apiKey = '';
    if (agentConfig.provider_key_name) {
      apiKey = PROVIDER_API_KEYS[agentConfig.provider_key_name] || '';

      if (!apiKey) {
        throw new Error(`API key for provider ${agentConfig.provider} is not set in environment variables`);
      }
    } else {
      throw new Error(`Provider key name is missing in the agent configuration`);
    }

    // Create an instance of the AI agent
    const ai = new AIConstructor({
      apiKey,
      config: agentConfig.ai,
      options: {
        debug: agentConfig.debug || false
      }
    });

    // If an apiURL is provided in the agent config, set it in the AI agent
    if (agentConfig.apiURL) {
      ai.setAPIURL(agentConfig.apiURL);
    }

    // Set all options from the agent configuration
    ai.setOptions({ ...agentConfig.options });
    
    // Prepare functions for the AI agent
    const agentFunctions = (agentConfig.functions || [])
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
      description: agentConfig.description,
      signature: agentConfig.signature,
      functions: agentFunctions,
      subAgentNames: agentConfig.agents || []
    };
  } catch (error) {
    console.error(error);
    throw new Error(`Error setting up AI agent`);
  }
};

export { getAgentConfigParams }