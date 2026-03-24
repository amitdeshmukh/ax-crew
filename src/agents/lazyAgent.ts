import { AxSignature as AxSignatureClass } from "@ax-llm/ax";
import type { AxFunction } from "@ax-llm/ax";
import type { AxCrewConfig } from "../types.js";
import type { StatefulAxAgent } from "./statefulAgent.js";
import { parseCrewConfig } from "./agentConfig.js";

/**
 * Lightweight proxy that stands in for a real agent in the crew's agent map.
 * It exposes the same `getFunction()` interface (built from the crew config)
 * but defers the expensive `createAgent()` call — and therefore MCP server
 * startup — until the Manager actually delegates to it.
 *
 * Usage: `crew.addLazyAgent("CreateChart")` instead of `crew.addAgent("CreateChart")`
 */
class LazyStatefulAxAgent {
  private realAgent: StatefulAxAgent | null = null;
  private crewRef: any; // AxCrew — forward-declared to avoid circular ref
  private agentName: string;
  private description: string;
  private signatureStr: string;
  private func: AxFunction;
  private _id: string = "lazy";

  constructor(crewRef: any, agentName: string, crewConfig: AxCrewConfig) {
    this.crewRef = crewRef;
    this.agentName = agentName;

    const agentDef = parseCrewConfig(crewConfig).crew.find(
      (a) => a.name === agentName
    );
    if (!agentDef) {
      throw new Error(`Agent "${agentName}" not found in crew config`);
    }

    this.description = agentDef.description;
    this.signatureStr = agentDef.signature as string;

    // Build the tool schema from the signature's input fields
    const sig = new AxSignatureClass(this.signatureStr);
    const parameters = sig.toInputJSONSchema();

    this.func = {
      name: agentName.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase(),
      description: this.description,
      parameters,
      func: async (args?: any) => {
        const agent = await this.resolve();
        return agent.forward(args);
      },
    };
  }

  private async resolve(): Promise<StatefulAxAgent> {
    if (!this.realAgent) {
      const agent = await this.crewRef.createAgent(this.agentName) as StatefulAxAgent;
      agent.setId(this._id);
      this.realAgent = agent;
    }
    return this.realAgent!;
  }

  // AxAgentic interface
  getFunction(): AxFunction {
    return this.func;
  }

  getSignature() {
    return new AxSignatureClass(this.signatureStr);
  }

  // AxProgrammable / AxTunable stubs
  getId(): string { return this._id; }
  setId(id: string): void { this._id = id; }
  getTraces(): any[] { return this.realAgent?.getTraces() ?? []; }
  setDemos(): void { /* no-op until resolved */ }
  getUsage(): any[] { return this.realAgent?.getUsage() ?? []; }
  resetUsage(): void { this.realAgent?.resetUsage(); }

  // Forward / streaming — resolve on demand
  async forward(...args: any[]): Promise<any> {
    const agent = await this.resolve();
    return (agent as any).forward(...args);
  }
  streamingForward(...args: any[]): any {
    // Must be sync to match the interface, so we wrap in an async generator
    const self = this;
    async function* lazyStream() {
      const agent = await self.resolve();
      yield* (agent as any).streamingForward(...args);
    }
    return lazyStream();
  }
}

export { LazyStatefulAxAgent };
