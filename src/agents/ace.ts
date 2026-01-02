import type { AxAI } from "@ax-llm/ax";
// AxACE and AxMetricFn are used as loose types (any fallback) to avoid hard coupling at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AxACE = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AxMetricFn = any;

import { ai as buildAI } from "@ax-llm/ax";
import type { ACEConfig, ACEPersistenceConfig, ACEMetricConfig, ACETeacherConfig, FunctionRegistryType } from "../types.js";
import type { StatefulAxAgent } from "./index.js";

function isNodeLike(): boolean {
  try {
    // @ts-ignore
    return typeof process !== "undefined" && !!process.versions?.node;
  } catch {
    return false;
  }
}

async function readFileJSON(path: string): Promise<any | undefined> {
  if (!isNodeLike()) return undefined;
  try {
    const { readFile } = await import("fs/promises");
    const buf = await readFile(path, "utf-8");
    return JSON.parse(buf);
  } catch {
    return undefined;
  }
}

async function writeFileJSON(path: string, data: any): Promise<void> {
  if (!isNodeLike()) return;
  try {
    const { mkdir, writeFile } = await import("fs/promises");
    const { dirname } = await import("path");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(data ?? {}, null, 2), "utf-8");
  } catch {
    // swallow persistence errors by default
  }
}

export function buildACEOptimizer(agent: StatefulAxAgent, cfg: ACEConfig): AxACE {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AxACECtor: any = (globalThis as any)?.AxACE;
  const maybeCtor = AxACECtor || (undefined as unknown as AxACE);
  // Lazy require AxACE via global or via @ax-llm/ax dynamic import if available at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Optimizer: any = (maybeCtor as any) || (requireACE() as any);
  const student: AxAI = (agent as any).axai;
  const teacher = buildTeacherAI(cfg.teacher, student);
  // Options are forwarded as-is; Ax will validate
  return new Optimizer({ student, teacher, options: cfg.options || {} });
}

function buildTeacherAI(teacherCfg: ACETeacherConfig | undefined, fallback: AxAI): AxAI {
  if (!teacherCfg) return fallback;
  const { provider, providerKeyName, apiURL, ai, providerArgs } = teacherCfg;
  if (!provider || !providerKeyName || !ai) return fallback;
  const apiKey = resolveEnv(providerKeyName) || "";
  if (!apiKey) return fallback;
  const args: any = { name: provider, apiKey, config: ai, options: {} };
  if (apiURL) args.apiURL = apiURL;
  if (providerArgs && typeof providerArgs === "object") Object.assign(args, providerArgs);
  try { return buildAI(args); } catch { return fallback; }
}

function resolveEnv(name: string): string | undefined {
  try {
    // @ts-ignore
    if (typeof process !== "undefined" && process?.env) return process.env[name];
    // browser fallback
    return (globalThis as any)?.[name];
  } catch { return undefined; }
}

// Attempt to import AxACE from @ax-llm/ax only when needed (avoids ESM circulars)
function requireACE(): AxACE | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // @ts-ignore - runtime dynamic require compatible with ESM via transpiled output
    const mod = require("@ax-llm/ax");
    return (mod as any)?.AxACE;
  } catch {
    return undefined as unknown as AxACE;
  }
}

export async function loadInitialPlaybook(cfg?: ACEPersistenceConfig): Promise<any | undefined> {
  if (!cfg) return undefined;
  if (typeof cfg.onLoad === "function") {
    try { return await cfg.onLoad(); } catch { /* ignore */ }
  }
  if (cfg.initialPlaybook) return cfg.initialPlaybook;
  if (cfg.playbookPath) return await readFileJSON(cfg.playbookPath);
  return undefined;
}

export async function persistPlaybook(pb: any, cfg?: ACEPersistenceConfig): Promise<void> {
  if (!cfg) return;
  if (typeof cfg.onPersist === "function") {
    try { await cfg.onPersist(pb); } catch { /* ignore */ }
  }
  if (cfg.autoPersist && cfg.playbookPath) {
    await writeFileJSON(cfg.playbookPath, pb);
  }
}

export function resolveMetric(cfg: ACEMetricConfig | undefined, registry: FunctionRegistryType): AxMetricFn | undefined {
  if (!cfg) return undefined;
  const { metricFnName, primaryOutputField } = cfg;
  // Try to find a function by name in the registry
  const candidate = metricFnName ? (registry as any)[metricFnName] : undefined;
  if (typeof candidate === "function") return candidate as unknown as AxMetricFn;
  if (primaryOutputField) {
    // Provide a simple equality-based metric if requested
    const field = primaryOutputField;
    return (({ prediction, example }: any) => {
      try { return prediction?.[field] === example?.[field] ? 1 : 0; } catch { return 0; }
    }) as unknown as AxMetricFn;
  }
  return undefined;
}

export async function runOfflineCompile(args: {
  agent: StatefulAxAgent;
  optimizer: AxACE;
  metric?: AxMetricFn;
  examples?: any[];
  persistence?: ACEPersistenceConfig;
}): Promise<void> {
  const { agent, optimizer, metric, examples = [], persistence } = args;
  if (!optimizer || typeof (optimizer as any).compile !== "function") return;
  try {
    const result = await (optimizer as any).compile({ program: agent, examples, metric, options: (optimizer as any)?.options || {} });
    const playbook = result?.playbook ?? result?.optimizedProgram?.getPlaybook?.();
    if (playbook) {
      agent.applyPlaybook?.(playbook);
      await persistPlaybook(playbook, persistence);
    }
  } catch {
    // ignore compile errors to keep behavior non-breaking
  }
}

export async function runOnlineUpdate(args: {
  agent: StatefulAxAgent;
  optimizer: AxACE;
  example: any;
  prediction: any;
  feedback?: string;
  persistence?: ACEPersistenceConfig;
  tokenBudget?: number;
}): Promise<void> {
  const { agent, optimizer, example, prediction, feedback, persistence, tokenBudget } = args;
  if (!optimizer) return;
  try {
    // Support different method names defensively
    let result: any;
    if (typeof (optimizer as any).updateOnline === "function") {
      result = await (optimizer as any).updateOnline({ program: agent, example, prediction, feedback, tokenBudget });
    } else if (typeof (optimizer as any).update === "function") {
      result = await (optimizer as any).update({ program: agent, example, prediction, feedback, tokenBudget });
    }
    const playbook = result?.playbook ?? result?.optimizedProgram?.getPlaybook?.();
    if (playbook) {
      agent.applyPlaybook?.(playbook);
      await persistPlaybook(playbook, persistence);
    }
  } catch {
    // ignore update errors
  }
}
