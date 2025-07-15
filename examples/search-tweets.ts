import { AxCrew } from "../dist/index.js";

import dotenv from "dotenv";
dotenv.config();

// Define the crew configuration
const config = {
  crew: [
    {
      name: "XSearchAgent",
      description: "A specialized agent that can search X (Twitter) posts for the latest news and updates about specific topics, people, or events. It can find trending posts, recent tweets, and real-time information from X platform.",
      signature: 'searchQuery:string "a search query" -> result:string "the response to the user query citing relevant sources including X posts and other web sources"',
      provider: "grok",
      providerKeyName: "GROK_API_KEY",
      ai: {
        model: "grok-3-latest",
        temperature: 0.1,
      },
      options: {
        stream: true,
        debug: true,
        searchParameters: {  
          mode: 'on',  
          returnCitations: true,  
          maxSearchResults: 10,  
          sources: [
            { type: 'x' },
            { type: 'web' },
            { type: 'news' }
          ]  
        }
      }
    }
  ]
};

// Create a new instance of AxCrew with the config
const crew = new AxCrew(config);

// Add the agents to the crew
await crew.addAllAgents();

// Get agent instances
const xSearchAgent = crew.agents?.get("XSearchAgent");

const userQuery: string = "when is the next ISRO launch date and what is the launch vehicle and payload";

console.log(`\n\nUser Query: ${userQuery}`);

const main = async (): Promise<void> => {
  const response = await xSearchAgent?.streamingForward({
    searchQuery: userQuery,
  });

  if (response) {
    try {
      for await (const chunk of response) {
        if (chunk.delta && typeof chunk.delta === 'object' && 'results' in chunk.delta) {
          process.stdout.write(chunk.delta.results);
        }
      }
      console.log('\n');
    } catch (error) {
      console.error('Error processing stream:', error);
    }
  }
};

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch(console.error);
