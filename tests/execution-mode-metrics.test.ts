import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AxCrewConfig } from "../src/types.js";
import { AxCrew, MetricsRegistry } from "../src/index.js";
import * as axModule from "@ax-llm/ax";

vi.mock("@ax-llm/ax", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof axModule;

  class MockAxDefaultCostTracker {
    private total = 0;

    trackTokens(count: number) {
      this.total += (count || 0) * 0.000001;
    }

    getCurrentCost() {
      return this.total;
    }
  }

  class MockAxGen {
    private usage: any[] = [];
    private signature: any;

    constructor(signature: any) {
      this.signature = signature;
    }

    async forward(_ai: any, values: Record<string, any>) {
      this.usage.push({
        ai: "mock-ai",
        model: "mock-model",
        tokens: { promptTokens: 5, completionTokens: 3 },
      });
      return { answer: `gen:${values.query ?? values.task ?? "ok"}` };
    }

    async *streamingForward(_ai: any, values: Record<string, any>) {
      this.usage.push({
        ai: "mock-ai",
        model: "mock-model",
        tokens: { promptTokens: 5, completionTokens: 3 },
      });
      yield { version: 1, index: 0, delta: { answer: `gen:${values.query ?? "ok"}` } };
    }

    register() {}

    setExamples() {}

    setDescription() {}

    getUsage() {
      return this.usage;
    }

    resetUsage() {
      this.usage = [];
    }

    getSignature() {
      return {
        getDescription: () => "",
      };
    }
  }

  class MockAxAgent {
    private usage: any[] = [];
    private signature: any;
    public program: any;
    public actorDescription = "";
    public responderDescription = "";

    constructor(config: any) {
      this.signature = {
        getDescription: () => "",
      };
      this.program = {
        setDescription: vi.fn(),
      };
      this.actorDescription = config?.agentIdentity?.description ?? "";
      this.responderDescription = config?.agentIdentity?.description ?? "";
    }

    async forward(_ai: any, values: Record<string, any>) {
      this.usage.push({
        ai: "mock-ai",
        model: "mock-model",
        tokens: { promptTokens: 11, completionTokens: 7 },
      });
      return { answer: `agent:${values.query ?? values.task ?? "ok"}` };
    }

    async *streamingForward(_ai: any, values: Record<string, any>) {
      this.usage.push({
        ai: "mock-ai",
        model: "mock-model",
        tokens: { promptTokens: 11, completionTokens: 7 },
      });
      yield { version: 1, index: 0, delta: { answer: `agent:${values.query ?? "ok"}` } };
    }

    getUsage() {
      return this.usage;
    }

    resetUsage() {
      this.usage = [];
    }

    getFunction() {
      return { name: "mockAgentFn", description: "mock", parameters: { type: "object", properties: {} } };
    }

    getSignature() {
      return this.signature;
    }

    _buildSplitPrograms() {}
  }

  return {
    ...actual,
    ai: vi.fn().mockImplementation((args: any) => ({
      getName: () => args.name,
      chat: vi.fn(),
      defaults: { model: args.config?.model ?? "mock-model" },
      options: args.options,
    })),
    AxAgent: MockAxAgent as any,
    AxGen: MockAxGen as any,
    AxDefaultCostTracker: MockAxDefaultCostTracker as any,
  };
});

const makeConfig = (mode: "axagent" | "axgen"): AxCrewConfig => ({
  crew: [
    {
      name: `mode-${mode}`,
      description: "Agent for execution mode metrics testing",
      executionMode: mode,
      signature: "query:string -> answer:string",
      provider: "openai" as any,
      providerKeyName: "OPENAI_API_KEY",
      ai: { model: "mock-model" } as any,
      axAgentOptions:
        mode === "axagent"
          ? {
              contextFields: [],
              mode: "simple",
            }
          : undefined,
    },
  ],
});

describe("Execution Mode Metrics + Tracing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MetricsRegistry.reset();
    process.env.OPENAI_API_KEY = "dummy-key";
  });

  afterEach(() => {
    MetricsRegistry.reset();
  });

  it("records built-in usage/cost and telemetry wiring in axagent mode", async () => {
    const telemetry = { tracer: { id: "tracer" }, meter: { id: "meter" } };
    const crew = new AxCrew(makeConfig("axagent"), {}, { telemetry } as any);
    await crew.addAllAgents();

    const agent = crew.agents?.get("mode-axagent");
    expect(agent).toBeDefined();

    const result = await agent!.forward({ query: "hello" });
    expect(result.answer).toContain("agent:");

    const aiCallArgs = vi.mocked(axModule.ai).mock.calls[0][0] as any;
    expect(aiCallArgs.options.tracer).toBe(telemetry.tracer);
    expect(aiCallArgs.options.meter).toBe(telemetry.meter);

    const crewMetrics = crew.getCrewMetrics();
    expect(crewMetrics.requests.totalRequests).toBe(1);
    expect(crewMetrics.tokens.totalTokens).toBe(18); // 11 + 7 from MockAxAgent
    expect(crewMetrics.estimatedCostUSD).toBeGreaterThan(0);
  });

  it("records built-in usage/cost and telemetry wiring in axgen mode", async () => {
    const telemetry = { tracer: { id: "tracer" }, meter: { id: "meter" } };
    const crew = new AxCrew(makeConfig("axgen"), {}, { telemetry } as any);
    await crew.addAllAgents();

    const agent = crew.agents?.get("mode-axgen");
    expect(agent).toBeDefined();

    const result = await agent!.forward({ query: "hello" });
    expect(result.answer).toContain("gen:");

    const aiCallArgs = vi.mocked(axModule.ai).mock.calls[0][0] as any;
    expect(aiCallArgs.options.tracer).toBe(telemetry.tracer);
    expect(aiCallArgs.options.meter).toBe(telemetry.meter);

    const crewMetrics = crew.getCrewMetrics();
    expect(crewMetrics.requests.totalRequests).toBe(1);
    expect(crewMetrics.tokens.totalTokens).toBe(8); // 5 + 3 from MockAxGen
    expect(crewMetrics.estimatedCostUSD).toBeGreaterThan(0);
  });

  it("tracks streaming requests in both execution modes", async () => {
    for (const mode of ["axagent", "axgen"] as const) {
      MetricsRegistry.reset();
      const crew = new AxCrew(makeConfig(mode), {}, { telemetry: {} } as any);
      await crew.addAllAgents();
      const agent = crew.agents?.get(`mode-${mode}`);
      expect(agent).toBeDefined();

      const stream = agent!.streamingForward({ query: "streaming" });
      for await (const _chunk of stream) {
        // consume
      }

      const crewMetrics = crew.getCrewMetrics();
      expect(crewMetrics.requests.totalRequests).toBe(1);
      expect(crewMetrics.requests.totalStreamingRequests).toBe(1);
      expect(crewMetrics.tokens.totalTokens).toBe(mode === "axagent" ? 18 : 8);
      expect(crewMetrics.estimatedCostUSD).toBeGreaterThan(0);
    }
  });
});
