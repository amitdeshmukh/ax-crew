import { v4 as uuidv4 } from "uuid";
import { AxAgent, AxAI } from "@ax-llm/ax";
import type {
  AxSignature,
  AxAgentic,
  AxFunction,
  AxProgramForwardOptions,
} from "@ax-llm/ax";
import { getAgentConfigParams } from "./agentConfig.js";
import type { AgentConfigInput } from "./agentConfig.js";
import { FunctionRegistryType } from "../functions/index.js";
import { createState, StateInstance } from "../state/index.js";

// Define the interface for the agent configuration
interface AgentConfigParams {
  ai: AxAI;
  name: string;
  description: string;
  signature: AxSignature;
  functions: (
    | AxFunction
    | (new (state: Record<string, any>) => { toFunction: () => AxFunction })
    | undefined
  )[];
  subAgentNames: string[];
}

// Extend the AxAgent class to include shared state functionality
class StatefulAxAgent extends AxAgent<any, any> {
  state: StateInstance;
  axai: any;

  constructor(
    ai: AxAI,
    options: Readonly<{
      name: string;
      description: string;
      signature: string | AxSignature;
      agents?: AxAgentic[] | undefined;
      functions?: (AxFunction | (() => AxFunction))[] | undefined;
    }>,
    state: StateInstance
  ) {
    const formattedOptions = {
      ...options,
      functions: options.functions?.map((fn) =>
        typeof fn === "function" ? fn() : fn
      ) as AxFunction[] | undefined,
    };
    super(formattedOptions);
    this.state = state;
    this.axai = ai;
  }
  async forward(
    input: Record<string, any>,
    options?: Readonly<AxProgramForwardOptions>
  ): Promise<Record<string, any>> {
    return super.forward(this.axai, input, options);
  }
}

/**
 * Represents a crew of agents with shared state functionality.
 */
class AxCrew {
  private agentConfig: AgentConfigInput;
  functionsRegistry: FunctionRegistryType = {};
  crewId: string;
  agents: Map<string, StatefulAxAgent> | null;
  state: StateInstance;

  /**
   * Creates an instance of AxCrew.
   * @param {AgentConfigInput} agentConfig - Either a path to the agent config file or a JSON object with crew configuration.
   * @param {FunctionRegistryType} [functionsRegistry={}] - The registry of functions to use in the crew.
   * @param {string} [crewId=uuidv4()] - The unique identifier for the crew.
   */
  constructor(
    agentConfig: AgentConfigInput,
    functionsRegistry: FunctionRegistryType = {},
    crewId: string = uuidv4()
  ) {
    this.agentConfig = agentConfig;
    this.functionsRegistry = functionsRegistry;
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
      const agentConfigParams: AgentConfigParams = getAgentConfigParams(
        agentName,
        this.agentConfig,
        this.functionsRegistry,
        this.state
      );

      // Destructure with type assertion
      const { ai, name, description, signature, functions, subAgentNames } =
        agentConfigParams;

      // Get subagents for the AI agent
      const subAgents = subAgentNames.map((subAgentName: string) => {
        if (!this.agents?.get(subAgentName)) {
          throw new Error(
            `Sub-agent '${subAgentName}' does not exist in available agents.`
          );
        }
        return this.agents?.get(subAgentName);
      });

      // Create an instance of StatefulAxAgent
      const agent = new StatefulAxAgent(
        ai,
        {
          name,
          description,
          signature,
          functions: functions.filter(
            (fn): fn is AxFunction => fn !== undefined
          ),
          agents: subAgents.filter(
            (agent): agent is StatefulAxAgent => agent !== undefined
          ),
        },
        this.state
      );

      return agent;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Adds an agent to the crew by name.
   * @param {string} agentName - The name of the agent to add.
   */
  addAgent(agentName: string): void {
    try {
      if (this.agents && !this.agents.has(agentName)) {
        this.agents.set(agentName, this.createAgent(agentName));
      }
    } catch (error) {
      console.error(`Failed to create agent '${agentName}':`);
      throw error;
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
    try {
      agentNames.forEach((agentName) => {
        this.addAgent(agentName);
      });
      return this.agents;
    } catch (error) {
      throw error;
    }
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
