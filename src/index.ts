import { AxCrew } from './agents/index.js';
import { AxCrewFunctions } from './functions/index.js';
import type { CrewConfigInput, AgentConfig } from './types.js';

import type { 
  UsageCost, 
  AggregatedMetrics, 
  AggregatedCosts,
  StateInstance, 
  FunctionRegistryType 
} from './types.js';

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
  type AggregatedMetrics,
  type AggregatedCosts,
  type AgentConfig,
  type CrewConfigInput,
  type AxCrewConfig,
  type StateInstance,
  type UsageCost,
};