import { AxCrew, AxCrewConfig } from "../dist/index.js";

const crewConfig: AxCrewConfig = {
  crew: [
    {
      name: "TestAgent",
      description: "Test Agent for testing provider arguments",
      provider: "azure-openai",
      providerKeyName: "AZURE_OPENAI_API_KEY",
      signature: "userQuery:string -> answer:string",
      ai: {
        model: "gpt-5-mini",
        temperature: 0,
        stream: false
      },
      providerArgs: {
        resourceName: "your-resource-name",
        deploymentName: "your-deployment-name",
        version: "2025-01-01-preview"
      },
      functions: [],
      options: {
        debug: true,
        stream: false
      }
    }
  ]
};

const crew = new AxCrew(crewConfig);
await crew.addAllAgents();

const testAgent = crew.agents?.get("TestAgent");

const response = await testAgent?.forward({
  userQuery: "What is the capital of France?"
});

console.log(response?.answer);

console.log(testAgent?.getAccumulatedCosts());