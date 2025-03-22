import type { StateInstance } from '../state/index.js';
import { Decimal } from 'decimal.js';

/**
 * The usage metrics of the model.
 * promptTokens: number;
 * completionTokens: number;
 */
export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * The published cost for using the model.
 * promptTokenCostPer1M: number;
 * completionTokenCostPer1M: number;
 */
export interface ModelInfo {
  promptTokenCostPer1M: number;
  completionTokenCostPer1M: number;
}

/**
 * The cost incurred for using the model.
 * 
 */
export interface UsageCost {
  promptCost: string;
  completionCost: string;
  totalCost: string;
  tokenMetrics: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }
}

/**
 * Aggregated metrics from all agent and sub-agent invocations.
 * 
 */
export interface AggregatedMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCost: string;
  completionCost: string;
}

/**
 * The incurred costs from all agent and sub-agent invocations.
 * 
 */
export interface AggregatedCosts {
  totalCost: string;
  byAgent: Record<string, UsageCost>;
  aggregatedMetrics: AggregatedMetrics;
}

/**
 * Utility class to handle usage related functionality.
 * 
 */
export class StateFulAxAgentUsage {
  static STATE_KEY_PREFIX = 'agent_usage_';

  static calculateCost(modelUsage: ModelUsage, modelInfo: ModelInfo): UsageCost {
    const { promptTokens, completionTokens } = modelUsage;
    const { promptTokenCostPer1M, completionTokenCostPer1M } = modelInfo;

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
  }

  static trackCostInState(agentName: string, cost: UsageCost, state: StateInstance) {
    const stateKey = `${this.STATE_KEY_PREFIX}${agentName}`;
    const existingCost = state.get(stateKey) as UsageCost | undefined;

    if (existingCost) {
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
    } else {
      // First time tracking this agent's cost
      state.set(stateKey, cost);
    }
  }

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
      }
    };
  }

  static resetCosts(state: StateInstance) {
    const allState = state.getAll();
    Object.keys(allState).forEach(key => {
      if (key.startsWith(this.STATE_KEY_PREFIX)) {
        state.set(key, undefined);
      }
    });
  }
}