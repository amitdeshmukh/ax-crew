import type { LabelKeys, MetricsSnapshot, TokenUsage } from './types.js';

type Key = string;

type Counters = {
  requests: number;
  errors: number;
  streaming: number;
  durationMsSum: number;
  durationCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
  functionCalls: number;
  functionLatencyMs: number;
};

const store = new Map<Key, Counters>();

function keyOf(labels: LabelKeys): Key {
  const { crewId, agent = '', provider = '', model = '' } = labels;
  return [crewId, agent, provider, model].join('|');
}

function getOrInit(labels: LabelKeys): Counters {
  const k = keyOf(labels);
  let c = store.get(k);
  if (!c) {
    c = {
      requests: 0,
      errors: 0,
      streaming: 0,
      durationMsSum: 0,
      durationCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUSD: 0,
      functionCalls: 0,
      functionLatencyMs: 0,
    };
    store.set(k, c);
  }
  return c;
}

export function recordRequest(labels: LabelKeys, streaming: boolean, durationMs: number) {
  const c = getOrInit(labels);
  c.requests += 1;
  if (streaming) c.streaming += 1;
  c.durationMsSum += durationMs;
  c.durationCount += 1;
}

export function recordError(labels: LabelKeys) {
  const c = getOrInit(labels);
  c.errors += 1;
}

export function recordTokens(labels: LabelKeys, usage: TokenUsage) {
  const c = getOrInit(labels);
  c.inputTokens += usage.promptTokens || 0;
  c.outputTokens += usage.completionTokens || 0;
}

export function recordEstimatedCost(labels: LabelKeys, usd: number) {
  const c = getOrInit(labels);
  c.estimatedCostUSD += usd || 0;
}

export function recordFunctionCall(labels: LabelKeys, latencyMs: number) {
  const c = getOrInit(labels);
  c.functionCalls += 1;
  c.functionLatencyMs += latencyMs || 0;
}

export function snapshot(labels: LabelKeys): MetricsSnapshot {
  const c = getOrInit(labels);
  const totalTokens = c.inputTokens + c.outputTokens;
  return {
    provider: labels.provider,
    model: labels.model,
    requests: {
      totalRequests: c.requests,
      totalErrors: c.errors,
      errorRate: c.requests > 0 ? c.errors / c.requests : 0,
      totalStreamingRequests: c.streaming,
      durationMsSum: c.durationMsSum,
      durationCount: c.durationCount,
    },
    tokens: {
      promptTokens: c.inputTokens,
      completionTokens: c.outputTokens,
      totalTokens,
    },
    estimatedCostUSD: c.estimatedCostUSD,
    functions: {
      totalFunctionCalls: c.functionCalls,
      totalFunctionLatencyMs: c.functionLatencyMs,
    },
  };
}

export function reset(labels?: LabelKeys) {
  if (!labels) {
    store.clear();
    return;
  }
  const k = keyOf(labels);
  store.delete(k);
}

export function snapshotCrew(crewId: string): MetricsSnapshot {
  const empty: Counters = {
    requests: 0,
    errors: 0,
    streaming: 0,
    durationMsSum: 0,
    durationCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUSD: 0,
    functionCalls: 0,
    functionLatencyMs: 0,
  };
  const agg = Array.from(store.entries()).reduce((acc, [k, v]) => {
    if (k.startsWith(crewId + '|')) {
      acc.requests += v.requests;
      acc.errors += v.errors;
      acc.streaming += v.streaming;
      acc.durationMsSum += v.durationMsSum;
      acc.durationCount += v.durationCount;
      acc.inputTokens += v.inputTokens;
      acc.outputTokens += v.outputTokens;
      acc.estimatedCostUSD += v.estimatedCostUSD;
      acc.functionCalls += v.functionCalls;
      acc.functionLatencyMs += v.functionLatencyMs;
    }
    return acc;
  }, { ...empty });

  const totalTokens = agg.inputTokens + agg.outputTokens;
  return {
    requests: {
      totalRequests: agg.requests,
      totalErrors: agg.errors,
      errorRate: agg.requests > 0 ? agg.errors / agg.requests : 0,
      totalStreamingRequests: agg.streaming,
      durationMsSum: agg.durationMsSum,
      durationCount: agg.durationCount,
    },
    tokens: {
      promptTokens: agg.inputTokens,
      completionTokens: agg.outputTokens,
      totalTokens,
    },
    estimatedCostUSD: agg.estimatedCostUSD,
    functions: {
      totalFunctionCalls: agg.functionCalls,
      totalFunctionLatencyMs: agg.functionLatencyMs,
    },
  } as MetricsSnapshot;
}


