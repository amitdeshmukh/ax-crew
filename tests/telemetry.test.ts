
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AxCrew } from '../src/index.js';
import type { AxCrewConfig } from '../src/types.js';
import * as axModule from '@ax-llm/ax';

// Mock the entire @ax-llm/ax module
vi.mock('@ax-llm/ax', async (importOriginal) => {
  const actual = await importOriginal() as typeof axModule;
  return {
    ...actual,
    // Spy on the ai factory function
    ai: vi.fn().mockImplementation((args) => {
      // Return a dummy object that mimics enough of AxAI to satisfy AxCrew
      return {
        getName: () => args.name,
        chat: vi.fn(),
        defaults: { model: args.config?.model },
        options: args.options // Store options so we can potentially inspect if needed, though we rely on the spy
      };
    }),
    // We need to keep other exports working if they are used
    AxAgent: actual.AxAgent,
    AxAI: actual.AxAI,
    AxDefaultCostTracker: actual.AxDefaultCostTracker
  };
});

describe('AxCrew Telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass telemetry options to the underlying AxAI factory', async () => {
    const mockTracer = { isMockTracer: true };
    const mockMeter = { isMockMeter: true };

    const crewConfig: AxCrewConfig = {
      crew: [
        {
          name: "telemetry-agent",
          description: "An agent for testing telemetry propagation",
          signature: "in:string -> out:string",
          provider: "openai",
          providerKeyName: "OPENAI_API_KEY",
          ai: { model: "gpt-4o-mini" }
        }
      ]
    };

    // Set dummy key
    process.env.OPENAI_API_KEY = 'dummy-key';

    const options = {
        telemetry: {
            tracer: mockTracer,
            meter: mockMeter
        }
    };

    // Initialize Crew with telemetry options (3rd argument now)
    const crew = new AxCrew(crewConfig, {}, options as any);

    // Create the agent
    await crew.addAgent("telemetry-agent");

    // Check if the 'ai' mock was called with the expected arguments
    expect(axModule.ai).toHaveBeenCalled();

    // Get the arguments of the first call to ai()
    const callArgs = vi.mocked(axModule.ai).mock.calls[0][0];

    // Verify the structure
    expect(callArgs).toBeDefined();
    expect(callArgs.options).toBeDefined();

    // Assert tracer and meter were passed correctly
    expect(callArgs.options.tracer).toBe(mockTracer);
    expect(callArgs.options.meter).toBe(mockMeter);
  });
});
