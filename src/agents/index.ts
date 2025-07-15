import { v4 as uuidv4 } from "uuid";
import { AxAgent, AxAI } from "@ax-llm/ax";

import type {
  AxSignature,
  AxAgentic,
  AxFunction,
  AxProgramForwardOptions,
  AxProgramStreamingForwardOptions,
  AxGenStreamingOut,
} from "@ax-llm/ax";

import type {
   StateInstance, 
   FunctionRegistryType, 
   UsageCost, 
   CrewConfigInput, 
   MCPTransportConfig,
} from "../types.js";

import { createState }   from "../state/index.js";
import { parseCrewConfig, parseAgentConfig } from "./agentConfig.js";
import { StateFulAxAgentUsage } from "./agentUseCosts.js";

// Define the interface for the agent configuration
interface ParsedAgentConfig {
  ai: AxAI;
  name: string;
  description: string;
  signature: string | AxSignature;
  functions: (
    | AxFunction
    | (new (state: Record<string, any>) => { toFunction: () => AxFunction })
    | undefined
  )[];
  mcpServers?: Record<string, MCPTransportConfig>;
  subAgentNames: string[];
  examples?: Array<Record<string, any>>;
}

// Extend the AxAgent class from ax-llm
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
      agents?: AxAgentic<any, any>[] | undefined;
      functions?: (AxFunction | (() => AxFunction))[] | undefined;
      examples?: Array<Record<string, any>> | undefined;
      mcpServers?: Record<string, MCPTransportConfig> | undefined;
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
      super.setExamples(examples);
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

  // Add streaming forward method overloads
  streamingForward(values: Record<string, any>, options?: Readonly<AxProgramStreamingForwardOptions>): AxGenStreamingOut<any>;
  streamingForward(ai: AxAI, values: Record<string, any>, options?: Readonly<AxProgramStreamingForwardOptions>): AxGenStreamingOut<any>;
  
  // Implementation
  streamingForward(
    first: Record<string, any> | AxAI,
    second?: Record<string, any> | Readonly<AxProgramStreamingForwardOptions>,
    third?: Readonly<AxProgramStreamingForwardOptions>
  ): AxGenStreamingOut<any> {
    let streamingResult: AxGenStreamingOut<any>;
    
    if ('apiURL' in first) {
      streamingResult = super.streamingForward(this.axai, second as Record<string, any>, third);
    } else {
      streamingResult = super.streamingForward(this.axai, first, second as Readonly<AxProgramStreamingForwardOptions>);
    }

    // Create a new async generator that tracks costs after completion
    const wrappedGenerator = (async function*(this: StatefulAxAgent) {
      try {
        for await (const chunk of streamingResult) {
          yield chunk;
        }
      } finally {
        const cost = this.getLastUsageCost();
        if (cost) {
          StateFulAxAgentUsage.trackCostInState(this.agentName, cost, this.state);
        }
      }
    }).bind(this)();

    return wrappedGenerator as AxGenStreamingOut<any>;
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
  private crewConfig: CrewConfigInput;
  functionsRegistry: FunctionRegistryType = {};
  crewId: string;
  agents: Map<string, StatefulAxAgent> | null;
  state: StateInstance;

  /**
   * Creates an instance of AxCrew.
   * @param {CrewConfigInput} crewConfig - Either a path to the agent config file or a JSON object with crew configuration.
   * @param {FunctionRegistryType} [functionsRegistry={}] - The registry of functions to use in the crew.
   * @param {string} [crewId=uuidv4()] - The unique identifier for the crew.
   */
  constructor(
    crewConfig: CrewConfigInput,
    functionsRegistry: FunctionRegistryType = {},
    crewId: string = uuidv4()
  ) {
    // Basic validation of crew configuration
    if (!crewConfig || typeof crewConfig !== 'object' || !('crew' in crewConfig)) {
      throw new Error('Invalid crew configuration');
    }

    // Validate each agent in the crew
    crewConfig.crew.forEach(agent => {
      if (!agent.name || agent.name.trim() === '') {
        throw new Error('Agent name cannot be empty');
      }
    });

    this.crewConfig = crewConfig;
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
  createAgent = async (agentName: string): Promise<StatefulAxAgent> => {
    try {
      const agentConfig: ParsedAgentConfig = await parseAgentConfig(
        agentName,
        this.crewConfig,
        this.functionsRegistry,
        this.state
      );

      // Destructure with type assertion
      const { ai, name, description, signature, functions, subAgentNames, examples } = agentConfig;

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
  async addAgent(agentName: string): Promise<void> {
    try {
      if (!this.agents) {
        this.agents = new Map<string, StatefulAxAgent>();
      }
      if (!this.agents.has(agentName)) {
        this.agents.set(agentName, await this.createAgent(agentName));
      }
      if (this.agents && !this.agents.has(agentName)) {
        this.agents.set(agentName, await this.createAgent(agentName));
      }
    } catch (error) {
      console.error(`Failed to create agent '${agentName}':`);
      throw new Error(`Failed to add agent ${agentName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Sets up agents in the crew by name.
   * For an array of Agent names provided, it adds
   * the agent to the crew if not already present.
   * @param {string[]} agentNames - An array of agent names to configure.
   * @returns {Map<string, StatefulAxAgent> | null} A map of agent names to their corresponding instances.
   */
  async addAgentsToCrew(agentNames: string[]): Promise<Map<string, StatefulAxAgent> | null> {
    try {
      // Parse the crew config to get agent dependencies
      const parsedConfig = parseCrewConfig(this.crewConfig);
      const dependencyMap = new Map<string, string[]>();
      parsedConfig.crew.forEach(agent => {
        dependencyMap.set(agent.name, agent.agents || []);
      });

      // Function to check if all dependencies are initialized
      const areDependenciesInitialized = (agentName: string): boolean => {
        const dependencies = dependencyMap.get(agentName) || [];
        return dependencies.every(dep => this.agents?.has(dep));
      };

      // Initialize agents sequentially based on dependencies
      const initializedAgents = new Set<string>();
      
      while (initializedAgents.size < agentNames.length) {
        let madeProgress = false;

        for (const agentName of agentNames) {
          // Skip if already initialized
          if (initializedAgents.has(agentName)) continue;

          // Check if all dependencies are initialized
          if (areDependenciesInitialized(agentName)) {
            await this.addAgent(agentName);
            initializedAgents.add(agentName);
            madeProgress = true;
          }
        }

        // If we couldn't initialize any agents in this iteration, we have a circular dependency
        if (!madeProgress) {
          const remaining = agentNames.filter(agent => !initializedAgents.has(agent));
          throw new Error(`Failed to initialize agents due to missing dependencies: ${remaining.join(', ')}`);
        }
      }

      return this.agents;
    } catch (error) {
      throw error;
    }
  }

  async addAllAgents(): Promise<Map<string, StatefulAxAgent> | null> {
    try {
      // Parse the crew config and get all agent configs
      const parsedConfig = parseCrewConfig(this.crewConfig);
      
      // Create a map of agent dependencies
      const dependencyMap = new Map<string, string[]>();
      parsedConfig.crew.forEach(agent => {
        dependencyMap.set(agent.name, agent.agents || []);
      });

      // Function to check if all dependencies are initialized
      const areDependenciesInitialized = (agentName: string): boolean => {
        const dependencies = dependencyMap.get(agentName) || [];
        return dependencies.every(dep => this.agents?.has(dep));
      };

      // Get all agent names
      const allAgents = parsedConfig.crew.map(agent => agent.name);
      const initializedAgents = new Set<string>();

      // Keep trying to initialize agents until all are done or we can't make progress
      while (initializedAgents.size < allAgents.length) {
        let madeProgress = false;

        for (const agentName of allAgents) {
          // Skip if already initialized
          if (initializedAgents.has(agentName)) continue;

          // Check if all dependencies are initialized
          if (areDependenciesInitialized(agentName)) {
            await this.addAgent(agentName);
            initializedAgents.add(agentName);
            madeProgress = true;
          }
        }

        // If we couldn't initialize any agents in this iteration, we have a circular dependency
        if (!madeProgress) {
          const remaining = allAgents.filter(agent => !initializedAgents.has(agent));
          throw new Error(`Circular dependency detected or missing dependencies for agents: ${remaining.join(', ')}`);
        }
      }

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