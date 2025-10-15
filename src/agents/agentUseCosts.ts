import { Decimal } from 'decimal.js';
import type { 
  StateInstance, 
  ModelUsage, 
  ModelInfo,
  UsageCost, 
  AggregatedMetrics, 
  AggregatedCosts 
} from '../types.js';

/**
 * Utility class to handle usage related functionality.
 * 
 */
export class StateFulAxAgentUsage {
  static STATE_KEY_PREFIX = 'agent_usage_';

  /**
   * Compute usage costs given a model usage record and model pricing info.
   * Returns null if inputs are invalid. Token-based costs are computed with high precision.
   */
  static calculateCost(modelUsage: ModelUsage, modelInfo: ModelInfo): UsageCost | null {
    // Handle both direct properties and nested tokens structure
    const promptTokens = (modelUsage as any).tokens?.promptTokens ?? modelUsage.promptTokens;
    const completionTokens = (modelUsage as any).tokens?.completionTokens ?? modelUsage.completionTokens;
    const { promptTokenCostPer1M, completionTokenCostPer1M } = modelInfo;

    // Return null instead of throwing errors for invalid values
    if (typeof promptTokens !== 'number' || isNaN(promptTokens) ||
        typeof completionTokens !== 'number' || isNaN(completionTokens) ||
        typeof promptTokenCostPer1M !== 'number' || isNaN(promptTokenCostPer1M) ||
        typeof completionTokenCostPer1M !== 'number' || isNaN(completionTokenCostPer1M)) {
      return null;
    }

    try {
      // Use Decimal for precise calculations
      const promptCost = new Decimal(promptTokens)
        .div(1000000)
        .mul(promptTokenCostPer1M)
        .toDP(10);  // Keep 10 decimal places

      const completionCost = new Decimal(completionTokens)
        .div(1000000)
        .mul(completionTokenCostPer1M)
        .toDP(10);

      const totalCost = promptCost.plus(completionCost).toDP(10);

      return {
        promptCost: promptCost.toString(),
        completionCost: completionCost.toString(),
        totalCost: totalCost.toString(),
        tokenMetrics: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens
        }
      };
    } catch (error) {
      // If any decimal calculation fails, return null instead of throwing
      return null;
    }
  }

  /**
   * Persist or aggregate the cost for an agent in the shared crew state.
   * No-op if cost is null.
   */
  static trackCostInState(agentName: string, cost: UsageCost | null, state: StateInstance) {
    // If cost is null, skip tracking
    if (!cost) return;

    const stateKey = `${this.STATE_KEY_PREFIX}${agentName}`;
    const existingCost = state.get(stateKey) as UsageCost | undefined;

    if (existingCost) {
      try {
        // Aggregate with existing cost using Decimal
        const aggregatedCost: UsageCost = {
          promptCost: new Decimal(existingCost.promptCost).plus(cost.promptCost).toDP(10).toString(),
          completionCost: new Decimal(existingCost.completionCost).plus(cost.completionCost).toDP(10).toString(),
          totalCost: new Decimal(existingCost.totalCost).plus(cost.totalCost).toDP(10).toString(),
          tokenMetrics: {
            promptTokens: existingCost.tokenMetrics.promptTokens + cost.tokenMetrics.promptTokens,
            completionTokens: existingCost.tokenMetrics.completionTokens + cost.tokenMetrics.completionTokens,
            totalTokens: existingCost.tokenMetrics.totalTokens + cost.tokenMetrics.totalTokens
          }
        };
        state.set(stateKey, aggregatedCost);
      } catch (error) {
        // If aggregation fails, just use the new cost
        state.set(stateKey, cost);
      }
    } else {
      // First time tracking this agent's cost
      state.set(stateKey, cost);
    }
  }

  /**
   * Aggregate and return total costs across all agents from the shared crew state.
   */
  static getAggregatedCosts(state: StateInstance): AggregatedCosts {
    const allState = state.getAll();
    const agentCosts: Record<string, UsageCost> = {};
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalPromptCost = new Decimal(0);
    let totalCompletionCost = new Decimal(0);

    // Aggregate costs from all agents
    Object.entries(allState).forEach(([key, value]) => {
      if (key.startsWith(this.STATE_KEY_PREFIX)) {
        const agentName = key.replace(this.STATE_KEY_PREFIX, '');
        const cost = value as UsageCost;
        agentCosts[agentName] = cost;
        
        totalPromptTokens += cost.tokenMetrics.promptTokens;
        totalCompletionTokens += cost.tokenMetrics.completionTokens;
        totalPromptCost = totalPromptCost.plus(cost.promptCost);
        totalCompletionCost = totalCompletionCost.plus(cost.completionCost);
      }
    });

    // Calculate total cost from the sum of prompt and completion costs
    const totalCost = totalPromptCost.plus(totalCompletionCost).toDP(10);

    return {
      totalCost: totalCost.toString(),
      byAgent: agentCosts,
      aggregatedMetrics: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        promptCost: totalPromptCost.toDP(10).toString(),
        completionCost: totalCompletionCost.toDP(10).toString()
      } as AggregatedMetrics
    };
  }

  /**
   * Remove all stored per-agent costs from the shared crew state.
   */
  static resetCosts(state: StateInstance) {
    const allState = state.getAll();
    Object.keys(allState).forEach(key => {
      if (key.startsWith(this.STATE_KEY_PREFIX)) {
        state.set(key, undefined);
      }
    });
  }
}