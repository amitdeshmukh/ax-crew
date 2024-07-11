import { v4 as uuidv4 } from 'uuid';
import { AxAgent, AxAI } from '@ax-llm/ax';
import type { AxSignature, AxAgentic, AxFunction } from '@ax-llm/ax';
import { getAgentConfigParams } from './agentConfig.js';
import { createState, StateInstance } from '../state/createState.js';

// Define the interface for the agent configuration
interface AgentConfigParams {
  ai: AxAI;
  name: string;
  description: string;
  signature: AxSignature;
  functions: (AxFunction | { toFunction: () => AxFunction; } | undefined)[];
  subAgentNames: string[];
}

// Extend the AxAgent class to include shared state functionality
class StatefulAxAgent extends AxAgent<any, any> {
  state: StateInstance;
  constructor(ai: AxAI, options: Readonly<{ name: string; description: string; signature: string | AxSignature; agents?: AxAgentic[] | undefined; functions?: (AxFunction | (() => AxFunction))[] | undefined; }>, state: StateInstance) {
    const formattedOptions = {
      ...options,
      functions: options.functions?.map(fn => typeof fn === 'function' ? fn() : fn) as AxFunction[] | undefined
    };
    super(ai, formattedOptions);
    this.state = state;
  }
}

/**
 * Represents a crew of agents with shared state functionality.
 */
class AxCrew {
  private configFilePath: string;
  crewId: string;
  agents: Map<string, StatefulAxAgent> | null;
  state: StateInstance;

  /**
   * Creates an instance of AxCrew.
   * @param {string} configFilePath - Path to the agent config file.
   * @param {string} [crewId=uuidv4()] - The unique identifier for the crew.
   */
  constructor(configFilePath: string, crewId: string = uuidv4()) {
    this.configFilePath = configFilePath;
    this.crewId = crewId;
    this.agents = new Map<string, StatefulAxAgent>();
    this.state = createState(crewId);
  }

  /**
   * Factory function for creating an agent.
   * @param {string} agentName - The name of the agent to create.
   * @returns {StatefulAxAgent} The created StatefulAxAgent instance.
   * @throws Will throw an error if the agent creation fails.
   */
  createAgent = (agentName: string): StatefulAxAgent => {
    try {
      const agentConfigParams: AgentConfigParams = getAgentConfigParams(agentName, this.configFilePath, this.state);

      // Destructure with type assertion
      const { 
        ai, 
        name, 
        description, 
        signature, 
        functions,
        subAgentNames
      } = agentConfigParams;

      // Get subagents for the AI agent
      const subAgents = subAgentNames.map((subAgentName: string) => {
        if (!this.agents?.get(subAgentName)) {
          throw new Error(`Sub-agent '${subAgentName}' does not exist in available agents.`);
        }
        return this.agents?.get(subAgentName);
      });

      // Create an instance of StatefulAxAgent
      const agent = new StatefulAxAgent(ai, {
        name,
        description,
        signature,
        functions: functions.filter((fn): fn is AxFunction => fn !== undefined),
        agents: subAgents.filter((agent): agent is StatefulAxAgent => agent !== undefined)
      }, this.state);
      
      return agent;
    } catch (error) {
      console.error(`Failed to create agent '${agentName}':`, error);
      throw error;
    }
  };

  /**
   * Adds an agent to the crew by name.
   * @param {string} agentName - The name of the agent to add.
   */
  addAgent(agentName: string): void {
    if (this.agents && !this.agents.has(agentName)) {
      this.agents.set(agentName, this.createAgent(agentName));
    }
  }  

  /**
   * Sets up agents in the crew by name.
   * For an array of Agent names provided, it adds
   * the agent to the crew if not already present.
   * @param {string[]} agentNames - An array of agent names to configure.
   * @returns {Map<string, StatefulAxAgent> | null} A map of agent names to their corresponding instances.
   */
  addAgentsToCrew(agentNames: string[]): Map<string, StatefulAxAgent> | null {
    agentNames.forEach(agentName => {
      this.addAgent(agentName);
    });
    return this.agents;
  }

  /**
   * Cleans up the crew by dereferencing agents and resetting the state.
   */
  destroy() {
    this.agents = null;
    this.state.reset();
  }  
}

export { AxCrew };