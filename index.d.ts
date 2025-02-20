import { AxAI, AxAgentic, AxFunction, AxSignature, AxProgramForwardOptions, AxModelConfig, AxAgent } from "@ax-llm/ax";
import type { UsageCost, AggregatedCosts } from "./src/agents/agentUseCosts.js";

export { UsageCost, AggregatedCosts };

export interface StateInstance {
  reset(): void;
  set(key: string, value: any): void;
  get(key: string): any;
  getAll(): Record<string, any>;
  [key: string]: any;
}

export type FunctionRegistryType = {
  [key: string]: AxFunction | { new(state: Record<string, any>): { toFunction: () => AxFunction } };
};

export interface AgentConfig {
  name: string;
  description: string;
  signature: AxSignature;
  provider: string;
  providerKeyName?: string;
  ai: AxModelConfig & { model: string };
  debug?: boolean;
  apiURL?: string;
  options?: Record<string, any>;
  functions?: string[];
  agents?: string[];
  examples?: Array<Record<string, any>>;
}

export type AgentConfigInput = string | { crew: AgentConfig[] };

export class StatefulAxAgent extends AxAgent<Record<string, any>, Record<string, any>> {
  state: StateInstance;
  axai: AxAI;

  constructor(
    ai: AxAI,
    options: Readonly<{
      name: string;
      description: string;
      signature: string | AxSignature;
      agents?: AxAgentic[] | undefined;
      functions?: (AxFunction | (() => AxFunction))[] | undefined;
      examples?: Array<Record<string, any>> | undefined;
    }>,
    state: StateInstance
  );

  forward(
    input: Record<string, any>,
    options?: Readonly<AxProgramForwardOptions>
  ): Promise<Record<string, any>>;

  getUsageCost(): UsageCost | null;

  setExamples(examples: Array<Record<string, any>>): void;
}

export class AxCrew {
  private agentConfig: AgentConfigInput;
  functionsRegistry: FunctionRegistryType;
  crewId: string;
  agents: Map<string, StatefulAxAgent> | null;
  state: StateInstance;

  constructor(
    agentConfig: AgentConfigInput,
    functionsRegistry?: FunctionRegistryType,
    crewId?: string
  );

  createAgent(agentName: string): StatefulAxAgent;
  addAgent(agentName: string): void;
  addAgentsToCrew(agentNames: string[]): Map<string, StatefulAxAgent> | null;
  getAggregatedCosts(): AggregatedCosts;
  resetCosts(): void;
  destroy(): void;
}

export const AxCrewFunctions: {
  CurrentDateTime: { new(state: Record<string, any>): { toFunction: () => AxFunction } };
  DaysBetweenDates: { new(state: Record<string, any>): { toFunction: () => AxFunction } };
};
