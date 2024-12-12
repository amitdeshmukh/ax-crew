export class AxCrew {
  constructor(configPath: string);
  addAgent(agent: any): void;
  createAgent(agent: any): void;
  addAgentsToCrew(agents: any[]): void;
  destroy(): void;
}
