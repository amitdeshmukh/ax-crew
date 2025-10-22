import { ai } from '@ax-llm/ax';
import type { AxAI } from '@ax-llm/ax';
import type { CrewConfig } from '../types.js';

type BuildProviderArgs = {
  provider: string;
  apiKey: string;
  config: any;
  apiURL?: string;
  providerArgs?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export function instantiateProvider({
  provider,
  apiKey,
  config,
  apiURL,
  providerArgs,
  options,
}: BuildProviderArgs): AxAI<any> {
  const args: any = { name: provider as any, apiKey, config, options };
  if (apiURL) args.apiURL = apiURL;
  if (providerArgs && typeof providerArgs === 'object') Object.assign(args, providerArgs);
  return ai(args) as unknown as AxAI<any>;
}

export function buildProvidersFromConfig(cfg: CrewConfig): AxAI<any>[] {
  const services: AxAI<any>[] = [];
  for (const agent of cfg.crew) {
    const apiKeyName = agent.providerKeyName;
    if (!apiKeyName) throw new Error(`Provider key name is missing for agent ${agent.name}`);
    const apiKey = resolveApiKey(apiKeyName) || '';
    if (!apiKey) throw new Error(`API key '${apiKeyName}' not set for agent ${agent.name}`);

    const service = instantiateProvider({
      provider: String(agent.provider).toLowerCase(),
      apiKey,
      config: agent.ai,
      apiURL: agent.apiURL,
      providerArgs: (agent as any).providerArgs,
      options: agent.options,
    });
    services.push(service);
  }
  return services;
}


// Provider discovery helpers consolidated here (previously in src/providers.ts)
export function discoverProvidersFromConfig(cfg: CrewConfig): string[] {
  const providers = new Set<string>();
  for (const agent of cfg.crew) {
    providers.add(String(agent.provider).toLowerCase());
  }
  return Array.from(providers);
}

export function listSelectableProviders(cfg: CrewConfig): string[] {
  return discoverProvidersFromConfig(cfg);
}

function resolveApiKey(varName: string): string | undefined {
  try {
    // Prefer Node env when available
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (typeof process !== 'undefined' && process?.env) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return process.env[varName];
    }
    // Fallback: allow global exposure in browser builds (e.g., injected at runtime)
    return (globalThis as any)?.[varName];
  } catch {
    return undefined;
  }
}


