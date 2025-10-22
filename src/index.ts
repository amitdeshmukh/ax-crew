import { AxCrew } from './agents/index.js';
import { AxCrewFunctions } from './functions/index.js';
import type { CrewConfig, AgentConfig } from './types.js';

import type { 
  UsageCost, 
  AggregatedMetrics, 
  AggregatedCosts,
  StateInstance, 
  FunctionRegistryType 
} from './types.js';
/**
 * Metrics types and helpers for request counts, token usage, and estimated cost.
 *
 * Re-exports the metrics module for convenience:
 *  - Types: TokenUsage, MetricsSnapshot, etc.
 *  - Namespace: MetricsRegistry (record/snapshot/reset helpers)
 */
export * from './metrics/index.js';
/**
 * MetricsRegistry provides functions to record requests, tokens, and cost,
 * and to snapshot/reset metrics at agent or crew granularity.
 */
export { MetricsRegistry } from './metrics/index.js';

// Main AxCrew configuration interface
/**
 * Top-level configuration for an AxCrew instance.
 *
 * Provide an array of agent definitions that specify provider, model, signature,
 * optional tools (functions), sub-agents, examples, MCP servers, and options.
 *
 * @property {AgentConfig[]} crew The agents that make up the crew.
 */
interface AxCrewConfig {
  crew: AgentConfig[];
}

/**
 * Create and manage a crew of Ax agents that share state and metrics.
 * See the `AxCrew` class for full documentation.
 */
const _AxCrew: typeof AxCrew = AxCrew;

/**
 * Built-in function registry with common tools that can be referenced by name
 * from agent configs, or extended with your own functions.
 */
const _AxCrewFunctions: typeof AxCrewFunctions = AxCrewFunctions;

export { 
  /** See class JSDoc on the `AxCrew` implementation. */
  _AxCrew as AxCrew,
  /** Built-in function registry; see file docs in `src/functions/index.ts`. */
  _AxCrewFunctions as AxCrewFunctions,
  FunctionRegistryType,
  // Type exports
  type AggregatedMetrics,
  type AggregatedCosts,
  type AgentConfig,
  type CrewConfig,
  type AxCrewConfig,
  type StateInstance,
  type UsageCost,
};