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
import { StateFulAxAgentUsage, UsageCost } from "./agentUseCosts.js";

// Define the interface for the agent configuration
interface AgentConfigParams {
  ai: AxAI;
  name: string;
  description: string;
  signature: string | AxSignature;
  functions: (
    | AxFunction
    | (new (state: Record<string, any>) => { toFunction: () => AxFunction })
    | undefined
  )[];
  subAgentNames: string[];
  examples?: Array<Record<string, any>>;
}

// Extend the AxAgent class to include shared state functionality
class StatefulAxAgent extends AxAgent<any, any> {
  state: StateInstance;
  axai: any;
  private agentName: string;

  constructor(
    ai: AxAI,
    options: Readonly<{
      name: string;
      description: string;
      signature: string | AxSignature;
      agents?: AxAgentic[] | undefined;
      functions?: (AxFunction | (() => AxFunction))[] | undefined;
      examples?: Array<Record<string, any>> | undefined;
    }>,
    state: StateInstance
  ) {
    const { examples, ...restOptions } = options;
    const formattedOptions = {
      ...restOptions,
      functions: restOptions.functions?.map((fn) =>
        typeof fn === "function" ? fn() : fn
      ) as AxFunction[] | undefined,
    };
    super(formattedOptions);
    this.state = state;
    this.axai = ai;
    this.agentName = options.name;

    // Set examples if provided
    if (examples && examples.length > 0) {
      this.setExamples(examples);
    }
  }

  // Function overloads for forward method
  async forward(values: Record<string, any>, options?: Readonly<AxProgramForwardOptions>): Promise<Record<string, any>>;
  async forward(ai: AxAI, values: Record<string, any>, options?: Readonly<AxProgramForwardOptions>): Promise<Record<string, any>>;
  
  // Implementation
  async forward(
    first: Record<string, any> | AxAI,
    second?: Record<string, any> | Readonly<AxProgramForwardOptions>,
    third?: Readonly<AxProgramForwardOptions>
  ): Promise<Record<string, any>> {
    let result;
    
    // Track costs regardless of whether it's a direct or sub-agent call
    // This ensures we capture multiple legitimate calls to the same agent
    if ('apiURL' in first) {
      // Sub-agent case (called with AI service)
      result = await super.forward(this.axai, second as Record<string, any>, third);
    } else {
      // Direct call case
      result = await super.forward(this.axai, first, second as Readonly<AxProgramForwardOptions>);
    }

    // Track costs after the call
    const cost = this.getLastUsageCost();
    if (cost) {
      StateFulAxAgentUsage.trackCostInState(this.agentName, cost, this.state);
    }

    return result;
  }

  // Get the usage cost for the most recent run of the agent
  getLastUsageCost(): UsageCost | null {
    const { modelUsage, modelInfo, defaults } = this.axai;
    const currentModelInfo = modelInfo?.find((m: { name: string }) => m.name === defaults.model);
    
    if (!currentModelInfo || !modelUsage) {
      return null;
    }

    return StateFulAxAgentUsage.calculateCost(modelUsage, currentModelInfo);
  }

  // Get the accumulated costs for all runs of this agent
  getAccumulatedCosts(): UsageCost | null {
    const stateKey = `${StateFulAxAgentUsage.STATE_KEY_PREFIX}${this.agentName}`;
    return this.state.get(stateKey) as UsageCost | null;
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
      const { ai, name, description, signature, functions, subAgentNames, examples } =
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
          examples,
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

  /**
   * Gets aggregated costs for all agents in the crew
   * @returns Aggregated cost information for all agents
   */
  getAggregatedCosts(): ReturnType<typeof StateFulAxAgentUsage.getAggregatedCosts> {
    return StateFulAxAgentUsage.getAggregatedCosts(this.state);
  }

  /**
   * Resets all cost tracking for the crew
   */
  resetCosts(): void {
    StateFulAxAgentUsage.resetCosts(this.state);
  }
}

export { AxCrew };
