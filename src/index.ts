import { AxCrew } from './agents/index.js';
import { AxCrewFunctions, FunctionRegistryType } from './functions/index.js';
import type { UsageCost, AggregatedMetrics, AggregatedCosts } from './agents/agentUseCosts.js';
import type { AgentConfig, CrewConfigInput } from './agents/agentConfig.js';
import type { StateInstance } from './state/index.js';

// Main AxCrew configuration interface
/**
 * The configuration for an AxCrew.
 * 
 * @property {AgentConfig[]} crew - The agents that make up the crew.
 */
interface AxCrewConfig {
  crew: AgentConfig[];
}

export { 
  AxCrew,
  AxCrewFunctions,
  FunctionRegistryType,
  // Type exports
  type UsageCost,
  type AggregatedMetrics,
  type AggregatedCosts,
  type AgentConfig,
  type CrewConfigInput,
  type StateInstance,
  type AxCrewConfig
};