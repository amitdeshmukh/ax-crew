export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens?: number;
}

export interface CostSnapshot {
  usdTotal: number;
  tokenUsage: TokenUsage;
}

export interface RequestStats {
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  totalStreamingRequests: number;
  durationMsSum: number;
  durationCount: number;
}

export interface FunctionCallDetail {
  name: string;
  calls: number;
  totalLatencyMs: number;
}

export interface FunctionStats {
  totalFunctionCalls: number;
  totalFunctionLatencyMs: number;
  /** Per-function breakdown of calls and latency */
  details?: FunctionCallDetail[];
}

export interface MetricsSnapshot {
  provider?: string;
  model?: string;
  requests: RequestStats;
  tokens: TokenUsage;
  estimatedCostUSD: number;
  functions: FunctionStats;
}

export interface LabelKeys {
  crewId: string;
  agent?: string;
  provider?: string;
  model?: string;
}

export interface BudgetConfig {
  maxTokens?: number;
  maxCost?: number;
  costPerModel?: Record<string, number>; // USD per 1K tokens override
}


