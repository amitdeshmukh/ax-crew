/**
 * Example: Using Google Cloud Vertex AI with dynamic token refresh.
 *
 * When running Gemini models on Google Cloud (Vertex AI), you need
 * a short-lived access token instead of a static API key. Pass an
 * async function as `apiKey` and ax-crew will call it each time
 * the provider needs credentials.
 *
 * Prerequisites:
 *   npm install google-auth-library
 *   # Authenticate via: gcloud auth application-default login
 */
import { AxCrew } from "../dist/index.js";
import type { AxCrewConfig } from "../dist/types.js";
import { GoogleAuth } from "google-auth-library";

// Set up Google Auth — uses Application Default Credentials
const googleAuth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// Async function that returns a fresh access token
const getGoogleToken = async (): Promise<string> => {
  const client = await googleAuth.getClient();
  const response = await client.getAccessToken();
  if (!response.token) {
    throw new Error("Failed to get Google access token");
  }
  return response.token;
};

const crewConfig: AxCrewConfig = {
  crew: [
    {
      name: "GeminiAgent",
      description: "Agent using Google Cloud Vertex AI with dynamic token refresh",
      provider: "google-gemini",
      apiKey: getGoogleToken, // async function — called on each request
      signature: "userQuery:string -> answer:string",
      ai: {
        model: "gemini-2.0-flash",
        temperature: 0,
      },
      providerArgs: {
        projectId: "your-gcp-project-id",
        region: "global",
      },
    },
  ],
};

async function main() {
  const crew = new AxCrew(crewConfig);
  await crew.addAllAgents();

  const agent = crew.agents?.get("GeminiAgent");
  const response = await agent?.forward({
    userQuery: "What is the capital of France?",
  });

  console.log(response?.answer);
  console.log(agent?.getAccumulatedCosts());

  crew.destroy();
}

main().catch(console.error);
