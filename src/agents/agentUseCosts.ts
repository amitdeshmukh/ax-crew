interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
}

interface ModelInfo {
  promptTokenCostPer1M: number;
  completionTokenCostPer1M: number;
}

interface UsageCost {
  promptCost: number;
  completionCost: number;
  totalCost: number;
  tokenMetrics: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }
}

// Utility class to handle usage related functionality
export class StateFulAxAgentUsage {
  static calculateCost(modelUsage: ModelUsage, modelInfo: ModelInfo): UsageCost {
    const { promptTokens, completionTokens } = modelUsage;
    const { promptTokenCostPer1M, completionTokenCostPer1M } = modelInfo;

    return {
      promptCost: (promptTokens / 1000000) * promptTokenCostPer1M,
      completionCost: (completionTokens / 1000000) * completionTokenCostPer1M,
      totalCost: ((promptTokens / 1000000) * promptTokenCostPer1M) + 
                 ((completionTokens / 1000000) * completionTokenCostPer1M),
      tokenMetrics: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens
      }
    };
  }
}