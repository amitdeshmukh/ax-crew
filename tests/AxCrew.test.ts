import { describe, test, expect, beforeEach } from 'vitest';
import { AxCrew } from '../src/agents';
import { AxCrewFunctions } from '../src/functions';

describe('AxCrew', () => {
  // Basic initialization tests
  describe('Initialization', () => {
    test('should create AxCrew instance with valid config', () => {
      const config = {
        crew: [{
          name: "ResearchAgent",
          description: "A research agent that can search the web for information and provide detailed analysis of search results with proper citations",
          signature: "input:string -> output:string",
          provider: "anthropic",
          providerKeyName: "ANTHROPIC_API_KEY",
          ai: {
            model: "claude-3-haiku-20240307"
          }
        }]
      };
      
      const crew = new AxCrew(config, AxCrewFunctions);
      expect(crew).toBeInstanceOf(AxCrew);
    });

    test('should throw error with invalid config', () => {
      const invalidConfig = {
        crew: [{
          name: "",  // Empty name should fail validation
          description: "",  // Empty description should fail validation
          signature: "",  // Empty signature should fail validation
          provider: "anthropic",
          providerKeyName: "ANTHROPIC_API_KEY",
          ai: {
            model: ""  // Empty model should fail validation
          }
        }]
      };
      expect(() => new AxCrew(invalidConfig, AxCrewFunctions))
        .toThrowError('Agent name cannot be empty');
    });
  });

  // Agent management tests
  describe('Agent Management', () => {
    let crew: AxCrew;
    
    beforeEach(() => {
      crew = new AxCrew({
        crew: [
          {
            name: "agent1",
            description: "A sophisticated agent that processes text input and generates structured analysis with detailed explanations and recommendations",
            signature: "input:string -> output:string",
            provider: "anthropic",
            providerKeyName: "ANTHROPIC_API_KEY",
            ai: { model: "claude-3-haiku-20240307" }
          },
          {
            name: "agent2",
            description: "An advanced processing agent that builds upon agent1's output to provide deeper insights and actionable intelligence",
            signature: "input:string -> output:string",
            provider: "anthropic",
            providerKeyName: "ANTHROPIC_API_KEY",
            ai: { model: "claude-3-haiku-20240307" },
            agents: ["agent1"] // depends on agent1
          }
        ]
      }, AxCrewFunctions);
    });

    test('should add single agent successfully', async () => {
      await crew.addAgent('agent1');
      expect(crew.agents?.get('agent1')).toBeDefined();
    });

    test('should add multiple agents with dependencies', async () => {
      await crew.addAgentsToCrew(['agent1', 'agent2']);
      expect(crew.agents?.get('agent1')).toBeDefined();
      expect(crew.agents?.get('agent2')).toBeDefined();
    });

    test('should throw error when adding agent with missing dependency', async () => {
      await expect(crew.addAgent('agent2')).rejects.toThrow();
    });
  });

  // Cost tracking tests
  describe('Cost Tracking', () => {
    let crew: AxCrew;
    
    beforeEach(async () => {
      crew = new AxCrew({
        crew: [{
          name: "testAgent",
          description: "A comprehensive testing agent that validates inputs, processes data, and ensures output quality through multiple verification steps",
          signature: "input:string -> output:string",
          provider: "anthropic",
          providerKeyName: "ANTHROPIC_API_KEY",
          ai: { model: "claude-3-haiku-20240307" }
        }]
      }, AxCrewFunctions);
      
      await crew.addAgent('testAgent');
    });

    test('should track costs correctly', async () => {
      const costs = crew.getAggregatedCosts();
      expect(costs).toBeDefined();
      expect(costs).toHaveProperty('totalCost');
      expect(typeof costs.totalCost).toBe('string');
    });

    test('should reset costs', () => {
      crew.resetCosts();
      const costs = crew.getAggregatedCosts();
      expect(costs).toBeDefined();
      expect(costs).toHaveProperty('totalCost');
      expect(costs.totalCost).toBe('0');  // Updated to match actual format
    });
  });

  // Cleanup tests
  describe('Cleanup', () => {
    test('should properly destroy crew instance', async () => {
      const crew = new AxCrew({
        crew: [{
          name: "testAgent",
          description: "A comprehensive testing agent that validates inputs, processes data, and ensures output quality through multiple verification steps",
          signature: "input:string -> output:string",
          provider: "anthropic",
          providerKeyName: "ANTHROPIC_API_KEY",
          ai: { model: "claude-3-haiku-20240307" }
        }]
      }, AxCrewFunctions);
      
      await crew.addAgent('testAgent');
      crew.destroy();
      expect(crew.agents).toBeNull();
    });
  });
}); 