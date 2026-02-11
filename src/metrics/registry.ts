import type { LabelKeys, MetricsSnapshot, TokenUsage } from './types.js';
import Big from 'big.js';

type Key = string;

type FunctionCounter = { calls: number; latencyMs: number };

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
  /** Per-function-name breakdown */
  functionDetails: Map<string, FunctionCounter>;
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
      functionDetails: new Map(),
    };
    store.set(k, c);
  }
  return c;
}

/**
 * Record a completed request.
 * @param labels Crew/agent/provider/model identifiers
 * @param streaming Whether this was a streaming request
 * @param durationMs Duration in milliseconds
 */
export function recordRequest(labels: LabelKeys, streaming: boolean, durationMs: number) {
  const c = getOrInit(labels);
  c.requests += 1;
  if (streaming) c.streaming += 1;
  c.durationMsSum += durationMs;
  c.durationCount += 1;
}

/**
 * Record an error occurrence for the given labels.
 */
export function recordError(labels: LabelKeys) {
  const c = getOrInit(labels);
  c.errors += 1;
}

/**
 * Record token usage for a request (prompt and completion).
 */
export function recordTokens(labels: LabelKeys, usage: TokenUsage) {
  const c = getOrInit(labels);
  c.inputTokens += usage.promptTokens || 0;
  c.outputTokens += usage.completionTokens || 0;
}

/**
 * Add estimated cost (USD) to the cumulative total for the labels.
 */
export function recordEstimatedCost(labels: LabelKeys, usd: number) {
  const c = getOrInit(labels);
  const current = new Big(c.estimatedCostUSD || 0);
  const addition = new Big(usd || 0);
  c.estimatedCostUSD = Number(current.plus(addition));
}

/**
 * Record a function call invocation and add its latency to totals.
 * @param labels Crew/agent identifiers
 * @param latencyMs Duration of the function call in milliseconds
 * @param functionName Optional name of the function that was called
 */
export function recordFunctionCall(labels: LabelKeys, latencyMs: number, functionName?: string) {
  const c = getOrInit(labels);
  c.functionCalls += 1;
  c.functionLatencyMs += latencyMs || 0;
  if (functionName) {
    const detail = c.functionDetails.get(functionName) || { calls: 0, latencyMs: 0 };
    detail.calls += 1;
    detail.latencyMs += latencyMs || 0;
    c.functionDetails.set(functionName, detail);
  }
}

/**
 * Get a metrics snapshot for specific labels (crew + agent + optional provider/model).
 */
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
    estimatedCostUSD: Number(new Big(c.estimatedCostUSD || 0).round(5)),
    functions: {
      totalFunctionCalls: c.functionCalls,
      totalFunctionLatencyMs: c.functionLatencyMs,
      details: detailsFromMap(c.functionDetails),
    },
  };
}

/** Convert internal function detail map to sorted array */
function detailsFromMap(m: Map<string, FunctionCounter>) {
  if (m.size === 0) return undefined;
  return Array.from(m.entries()).map(([name, d]) => ({
    name,
    calls: d.calls,
    totalLatencyMs: d.latencyMs,
  }));
}

/**
 * Reset metrics for specific labels, or clear all if no labels provided.
 */
export function reset(labels?: LabelKeys) {
  if (!labels) {
    store.clear();
    return;
  }
  const k = keyOf(labels);
  store.delete(k);
}

/**
 * Aggregate a crew-wide metrics snapshot across all agents in the crew.
 */
export function snapshotCrew(crewId: string): MetricsSnapshot {
  const empty: Omit<Counters, 'functionDetails'> & { functionDetails: Map<string, FunctionCounter> } = {
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
    functionDetails: new Map(),
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
      acc.estimatedCostUSD = Number(new Big(acc.estimatedCostUSD || 0).plus(v.estimatedCostUSD || 0));
      acc.functionCalls += v.functionCalls;
      acc.functionLatencyMs += v.functionLatencyMs;
      // Merge per-function details
      for (const [fnName, d] of v.functionDetails) {
        const existing = acc.functionDetails.get(fnName) || { calls: 0, latencyMs: 0 };
        existing.calls += d.calls;
        existing.latencyMs += d.latencyMs;
        acc.functionDetails.set(fnName, existing);
      }
    }
    return acc;
  }, empty);

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
    estimatedCostUSD: Number(new Big(agg.estimatedCostUSD || 0).round(5)),
    functions: {
      totalFunctionCalls: agg.functionCalls,
      totalFunctionLatencyMs: agg.functionLatencyMs,
      details: detailsFromMap(agg.functionDetails),
    },
  } as MetricsSnapshot;
}


