/**
 * ACE (Agentic Context Engineering) integration for AxCrew
 * 
 * This module provides helpers to build and manage AxACE optimizers for agents,
 * enabling offline compilation and online learning from feedback.
 * 
 * Reference: https://axllm.dev/ace/
 */

import { AxACE, ai as buildAI, type AxMetricFn, AxSignature, AxGen } from "@ax-llm/ax";
import type { AxAI } from "@ax-llm/ax";
import type { 
  ACEConfig, 
  ACEPersistenceConfig, 
  ACEMetricConfig, 
  ACETeacherConfig,
  FunctionRegistryType 
} from "../types.js";

// Re-export types for convenience
export type { AxACE, AxMetricFn };

/**
 * Create an empty playbook structure
 */
export const createEmptyPlaybook = (): ACEPlaybook => {
  const now = new Date().toISOString();
  return {
    version: 1,
    sections: {},
    stats: {
      bulletCount: 0,
      helpfulCount: 0,
      harmfulCount: 0,
      tokenEstimate: 0,
    },
    updatedAt: now,
  };
};

/**
 * Playbook types (mirroring AxACEPlaybook structure)
 */
export interface ACEBullet {
  id: string;
  section: string;
  content: string;
  helpfulCount: number;
  harmfulCount: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ACEPlaybook {
  version: number;
  sections: Record<string, ACEBullet[]>;
  stats: {
    bulletCount: number;
    helpfulCount: number;
    harmfulCount: number;
    tokenEstimate: number;
  };
  updatedAt: string;
  description?: string;
}

/**
 * Render a playbook into markdown instruction block for injection into prompts.
 * Mirrors the AxACE renderPlaybook function.
 */
export const renderPlaybook = (playbook: Readonly<ACEPlaybook>): string => {
  if (!playbook) return '';

  const sectionsObj = playbook.sections || {};
  const header = playbook.description
    ? `## Context Playbook\n${playbook.description.trim()}\n`
    : '## Context Playbook\n';

  const sectionEntries = Object.entries(sectionsObj);
  if (sectionEntries.length === 0) return '';

  const sections = sectionEntries
    .map(([sectionName, bullets]) => {
      const body = bullets
        .map((bullet) => `- [${bullet.id}] ${bullet.content}`)
        .join('\n');
      return body
        ? `### ${sectionName}\n${body}`
        : `### ${sectionName}\n_(empty)_`;
    })
    .join('\n\n');

  return `${header}\n${sections}`.trim();
};

/**
 * Check if running in Node.js environment (for file operations)
 */
const isNodeLike = (): boolean => {
  try {
    return typeof process !== "undefined" && !!process.versions?.node;
  } catch {
    return false;
  }
};

/**
 * Read JSON file (Node.js only)
 */
const readFileJSON = async (path: string): Promise<any | undefined> => {
  if (!isNodeLike()) return undefined;
  try {
    const { readFile } = await import("fs/promises");
    const buf = await readFile(path, "utf-8");
    return JSON.parse(buf);
  } catch {
    return undefined;
  }
};

/**
 * Write JSON file (Node.js only)
 */
const writeFileJSON = async (path: string, data: any): Promise<void> => {
  if (!isNodeLike()) return;
  try {
    const { mkdir, writeFile } = await import("fs/promises");
    const { dirname } = await import("path");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(data ?? {}, null, 2), "utf-8");
  } catch {
    // Swallow persistence errors by default
  }
};

/**
 * Resolve environment variable
 */
const resolveEnv = (name: string): string | undefined => {
  try {
    if (typeof process !== "undefined" && process?.env) {
      return process.env[name];
    }
    return (globalThis as any)?.[name];
  } catch {
    return undefined;
  }
};

/**
 * Build teacher AI instance from config, falling back to student AI
 */
const buildTeacherAI = (teacherCfg: ACETeacherConfig | undefined, fallback: AxAI): AxAI => {
  if (!teacherCfg) return fallback;
  
  const { provider, providerKeyName, apiURL, ai: aiConfig, providerArgs } = teacherCfg;
  if (!provider || !providerKeyName || !aiConfig) return fallback;
  
  const apiKey = resolveEnv(providerKeyName) || "";
  if (!apiKey) return fallback;
  
  const args: any = { 
    name: provider, 
    apiKey, 
    config: aiConfig, 
    options: {} 
  };
  
  if (apiURL) args.apiURL = apiURL;
  if (providerArgs && typeof providerArgs === "object") {
    Object.assign(args, providerArgs);
  }
  
  try {
    return buildAI(args);
  } catch {
    return fallback;
  }
};

/**
 * Build an AxACE optimizer for an agent
 * 
 * @param studentAI - The agent's AI instance (used as student)
 * @param cfg - ACE configuration
 * @returns Configured AxACE optimizer
 */
export const buildACEOptimizer = (studentAI: AxAI, cfg: ACEConfig): AxACE => {
  const teacherAI = buildTeacherAI(cfg.teacher, studentAI);
  
  // Build optimizer options, only include initialPlaybook if it has the right structure
  const optimizerOptions: any = { 
    maxEpochs: cfg.options?.maxEpochs,
    allowDynamicSections: cfg.options?.allowDynamicSections,
  };
  
  // Only pass initialPlaybook if it looks like a valid playbook structure
  if (cfg.persistence?.initialPlaybook && 
      typeof cfg.persistence.initialPlaybook === 'object' &&
      'sections' in cfg.persistence.initialPlaybook) {
    optimizerOptions.initialPlaybook = cfg.persistence.initialPlaybook;
  }
  
  return new AxACE(
    { 
      studentAI, 
      teacherAI, 
      verbose: !!cfg.options?.maxEpochs 
    },
    optimizerOptions
  );
};

/**
 * Load initial playbook from file, callback, or inline config
 * 
 * @param cfg - Persistence configuration
 * @returns Loaded playbook or undefined
 */
export const loadInitialPlaybook = async (cfg?: ACEPersistenceConfig): Promise<any | undefined> => {
  if (!cfg) return undefined;
  
  // Try callback first
  if (typeof cfg.onLoad === "function") {
    try {
      return await cfg.onLoad();
    } catch {
      // Fall through to other methods
    }
  }
  
  // Try inline playbook
  if (cfg.initialPlaybook) {
    return cfg.initialPlaybook;
  }
  
  // Try file path
  if (cfg.playbookPath) {
    return await readFileJSON(cfg.playbookPath);
  }
  
  return undefined;
};

/**
 * Persist playbook to file or via callback
 * 
 * @param pb - Playbook to persist
 * @param cfg - Persistence configuration
 */
export const persistPlaybook = async (pb: any, cfg?: ACEPersistenceConfig): Promise<void> => {
  if (!cfg || !pb) return;
  
  // Call persist callback if provided
  if (typeof cfg.onPersist === "function") {
    try {
      await cfg.onPersist(pb);
    } catch {
      // Ignore callback errors
    }
  }
  
  // Write to file if auto-persist enabled
  if (cfg.autoPersist && cfg.playbookPath) {
    await writeFileJSON(cfg.playbookPath, pb);
  }
};

/**
 * Resolve metric function from registry or create equality-based metric
 * 
 * @param cfg - Metric configuration
 * @param registry - Function registry to search
 * @returns Metric function or undefined
 */
export const resolveMetric = (
  cfg: ACEMetricConfig | undefined, 
  registry: FunctionRegistryType
): AxMetricFn | undefined => {
  if (!cfg) return undefined;
  
  const { metricFnName, primaryOutputField } = cfg;
  
  // Try to find a function by name in the registry
  if (metricFnName) {
    const candidate = (registry as any)[metricFnName];
    if (typeof candidate === "function") {
      return candidate as AxMetricFn;
    }
  }
  
  // Create simple equality-based metric if primary output field specified
  if (primaryOutputField) {
    const field = primaryOutputField;
    return ({ prediction, example }: { prediction: any; example: any }) => {
      try {
        return prediction?.[field] === example?.[field] ? 1 : 0;
      } catch {
        return 0;
      }
    };
  }
  
  return undefined;
};

/**
 * Run offline ACE compilation
 * 
 * @param args - Compilation arguments
 * @returns Compilation result with optimized program
 */
export const runOfflineCompile = async (args: {
  program: any;
  optimizer: AxACE;
  metric: AxMetricFn;
  examples: any[];
  persistence?: ACEPersistenceConfig;
}): Promise<any> => {
  const { program, optimizer, metric, examples = [], persistence } = args;
  
  if (!optimizer || !metric || examples.length === 0) {
    return null;
  }
  
  try {
    // Run compilation
    const result = await optimizer.compile(program, examples, metric);
    
    // Extract and persist playbook
    const playbook = result?.artifact?.playbook;
    if (playbook && persistence) {
      await persistPlaybook(playbook, persistence);
    }
    
    return result;
  } catch (error) {
    console.warn("ACE offline compile failed:", error);
    return null;
  }
};

/**
 * Apply online update with feedback
 * 
 * @param args - Update arguments
 * @returns Curator delta (operations applied)
 */
export const runOnlineUpdate = async (args: {
  optimizer: AxACE;
  example: any;
  prediction: any;
  feedback?: string;
  persistence?: ACEPersistenceConfig;
  tokenBudget?: number; // Reserved for future use
  debug?: boolean;
}): Promise<any> => {
  const { optimizer, example, prediction, feedback, persistence, debug } = args;
  
  if (!optimizer) return null;
  
  try {
    // Apply online update (per ACE API: example, prediction, feedback)
    const curatorDelta = await optimizer.applyOnlineUpdate({
      example,
      prediction,
      feedback
    });
    
    // Access the optimizer's private playbook property
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playbook = (optimizer as any).playbook;
    
    // Persist updated playbook if we have one and persistence is configured
    if (playbook && persistence?.autoPersist) {
      await persistPlaybook(playbook, persistence);
    }
    
    return curatorDelta;
  } catch (error) {
    // AxACE's reflector sometimes returns bulletTags in non-array format, causing iteration errors.
    // This is a known issue - we fall back to direct playbook updates via addFeedbackToPlaybook.
    if (debug) {
      console.warn("[ACE Debug] AxACE applyOnlineUpdate failed (falling back to direct update):", error);
    }
    return null;
  }
};

/**
 * Generate a unique bullet ID (mirrors AxACE's generateBulletId)
 */
const generateBulletId = (section: string): string => {
  const normalized = section
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 6);
  const randomHex = Math.random().toString(16).slice(2, 10);
  return `${normalized || 'ctx'}-${randomHex}`;
};

/**
 * Recompute playbook stats after modifications
 */
const recomputePlaybookStats = (playbook: ACEPlaybook): void => {
  let bulletCount = 0;
  let helpfulCount = 0;
  let harmfulCount = 0;
  let tokenEstimate = 0;

  const sections = playbook.sections || {};
  for (const bullets of Object.values(sections)) {
    for (const bullet of bullets) {
      bulletCount += 1;
      helpfulCount += bullet.helpfulCount;
      harmfulCount += bullet.harmfulCount;
      tokenEstimate += Math.ceil(bullet.content.length / 4);
    }
  }

  playbook.stats = { bulletCount, helpfulCount, harmfulCount, tokenEstimate };
  playbook.updatedAt = new Date().toISOString();
};

/**
 * Apply curator operations to playbook (mirrors AxACE's applyCuratorOperations)
 */
const applyCuratorOperations = (
  playbook: ACEPlaybook,
  operations: Array<{ type: 'ADD' | 'UPDATE' | 'REMOVE'; section: string; content?: string; bulletId?: string }>
): void => {
  // Ensure playbook has sections initialized
  if (!playbook.sections) {
    playbook.sections = {};
  }

  const now = new Date().toISOString();

  for (const op of operations) {
    if (!op.section) continue;

    // Initialize section if needed
    if (!playbook.sections[op.section]) {
      playbook.sections[op.section] = [];
    }

    const section = playbook.sections[op.section]!;

    switch (op.type) {
      case 'ADD': {
        if (!op.content?.trim()) continue;
        
        // Check for duplicates
        const isDuplicate = section.some(
          b => b.content.toLowerCase() === op.content!.toLowerCase()
        );
        if (isDuplicate) continue;

        const bullet: ACEBullet = {
          id: op.bulletId || generateBulletId(op.section),
          section: op.section,
          content: op.content.trim(),
          helpfulCount: 1,
          harmfulCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        section.push(bullet);
        break;
      }
      case 'UPDATE': {
        if (!op.bulletId) continue;
        const bullet = section.find(b => b.id === op.bulletId);
        if (bullet && op.content) {
          bullet.content = op.content.trim();
          bullet.updatedAt = now;
        }
        break;
      }
      case 'REMOVE': {
        if (!op.bulletId) continue;
        const idx = section.findIndex(b => b.id === op.bulletId);
        if (idx >= 0) section.splice(idx, 1);
        break;
      }
    }
  }

  recomputePlaybookStats(playbook);
};

// Cached feedback analyzer program (created lazily)
let feedbackAnalyzerProgram: AxGen<any, any> | null = null;

/**
 * Get or create the feedback analyzer program.
 * Uses AxGen with a proper signature, just like AxACE's reflector/curator.
 * 
 * Uses `class` type for section to get type-safe enums and better token efficiency.
 * See: https://axllm.dev/signatures/
 */
const getOrCreateFeedbackAnalyzer = (): AxGen<any, any> => {
  if (!feedbackAnalyzerProgram) {
    const signature = new AxSignature(
      `feedback:string "User feedback to analyze"
       -> 
       section:class "Guidelines, Response Strategies, Common Pitfalls, Root Cause Notes" "Playbook section category",
       content:string "The specific instruction to add to the playbook - keep all concrete details"`
    );
    
    signature.setDescription(
      `Convert user feedback into a playbook instruction. Keep ALL specific details from the feedback (times, names, numbers, constraints).`
    );
    
    feedbackAnalyzerProgram = new AxGen(signature);
  }
  return feedbackAnalyzerProgram;
};

/**
 * Use LLM to analyze feedback and generate playbook operations.
 * 
 * This leverages AxGen with a proper signature (like AxACE's reflector/curator)
 * to properly categorize feedback and extract actionable insights.
 * 
 * IMPORTANT: The prompt explicitly tells the LLM to preserve specificity.
 * 
 * @param ai - The AI instance to use for analysis
 * @param feedback - User feedback string
 * @param debug - Whether to log debug info
 * @returns Promise of curator operations
 */
export const analyzeAndCategorizeFeedback = async (
  ai: AxAI,
  feedback: string,
  debug = false
): Promise<Array<{ type: 'ADD' | 'UPDATE' | 'REMOVE'; section: string; content: string }>> => {
  if (!feedback?.trim()) return [];
  
  try {
    const analyzer = getOrCreateFeedbackAnalyzer();
    
    const result = await analyzer.forward(ai, {
      feedback: feedback.trim(),
    });
    
    if (debug) {
      console.log('[ACE Debug] Feedback analysis result:', result);
    }
    
    // Section is guaranteed to be valid by the class type constraint
    const section = result.section || 'Guidelines';
    // Use the LLM's content, but fall back to raw feedback if empty
    const content = result.content?.trim() || feedback.trim();
    
    return [{ type: 'ADD', section, content }];
  } catch (error) {
    if (debug) {
      console.warn('[ACE Debug] Feedback analysis failed, using raw feedback:', error);
    }
    // Fallback: use the raw feedback as-is
    return [{ type: 'ADD', section: 'Guidelines', content: feedback.trim() }];
  }
};

/**
 * Add feedback to playbook using LLM analysis.
 * 
 * Uses the AI to properly understand and categorize the feedback,
 * then applies it as a curator operation.
 * 
 * @param playbook - The playbook to update (mutated in place)
 * @param feedback - User feedback string to add
 * @param ai - AI instance for smart categorization
 * @param debug - Whether to log debug info
 */
export const addFeedbackToPlaybook = async (
  playbook: ACEPlaybook,
  feedback: string,
  ai: AxAI,
  debug = false
): Promise<void> => {
  if (!playbook || !feedback?.trim()) return;
  
  // Use LLM to categorize feedback while preserving specificity
  const operations = await analyzeAndCategorizeFeedback(ai, feedback, debug);
  
  if (operations.length > 0) {
    applyCuratorOperations(playbook, operations);
  }
};

