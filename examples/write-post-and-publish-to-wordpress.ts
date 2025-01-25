import { AxCrew, AxCrewFunctions, FunctionRegistryType } from '../dist/index.js';
import type { AxFunction } from '@ax-llm/ax';
import fetch from 'node-fetch';
import https from 'https';

// Type-safe configuration
const config = {
  crew: [
    {
      name: "SearchQueryGenerator",
      description: "Generates a list of google search queries to help research the topic",
      signature: "topic:string \"The topic of the blog post\", guidance:string \"guidance from the user on what the blog post should be about\" -> googleSearchQueries:string[] \"an array of google search queries to help research the topic\"",
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-3-5-sonnet-20240620",
        temperature: 1
      },
      options: {
        debug: true,
        stream: false
      }
    },
    {
      name: "GoogleSearch",
      description: "Searches google for information on the topic and returns the results from the search",
      signature: "googleSearchQuery:string \"keywords or topics to search for\" -> googleSearchResult:string \"the results from the google search\"",
      provider: "google-gemini",
      providerKeyName: "GEMINI_API_KEY",
      ai: {
        model: "gemini-2.0-flash-exp",
        temperature: 0.5
      },
      options: {
        debug: true,
        stream: false
      }
    },
    {
      name: "BlogPostWriter",
      description: "Write an engaging blog post about the topic. Start with a shocking statistic, controversial statement, or personal anecdote that immediately hooks the reader. The post should be structured in clear sections with descriptive headings, include real-world examples and data to support your points, and incorporate your unique voice and experiences throughout. Focus on providing actionable takeaways while maintaining a conversational tone. Make sure to bring the narrative full circle by connecting your opening hook to your conclusion. The post should be between 500-1,000 words and end with a thought-provoking question or call-to-action that encourages reader engagement. Feel free to use any and all information from the search results as this is not copyrighted material. It has been altered and paraphrased to be presented as a search result.",
      signature: "topic:string \"The topic of the blog post\", guidance:string \"guidance from the user on what the blog post should be about\", googleSearchResults:string[] \"web search results that include facts relevant to the topic\" -> blogPostTitle:string \"an SEO optimized blog post title\", blogPostContent:string \"The content of the blog post excluding the title. Use HTML for all headings (but not h1 and h2), paragraphs, lists, and any formatting like bold, italics, and links.\"",
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-3-5-sonnet-20240620",
        temperature: 1
      },
      options: {
        debug: true,
        stream: false
      }
    }
  ]
};

// Create custom functions with type safety
class MyCustomFunction {
  constructor(private state: Record<string, any>) {}
  
  toFunction(): AxFunction {
    return {
      name: 'MyCustomFunction',
      description: 'Does something useful',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string', description: "input to the function" }
        }
      },
      func: async ({ input }) => {
        // Implementation
        return input;
      }
    };
  }
}

// Function to post to WordPress
async function postToWordPress(title: string, content: string, status: 'draft' | 'publish' = 'draft') {
  const wpUrl = process.env.WORDPRESS_URL;
  const wpUsername = process.env.WORDPRESS_USERNAME;
  const wpPassword = process.env.WORDPRESS_PASSWORD;

  if (!wpUrl) {
    throw new Error('WordPress credentials not found in environment variables');
  }

  const auth = Buffer.from(`${wpUsername}:${wpPassword}`).toString('base64');
  
  const httpsAgent = new https.Agent({
    rejectUnauthorized: false
  });

  try {
    const response = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        content,
        status
      }),
      agent: httpsAgent
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WordPress API error: ${error}`);
    }

    const post = await response.json();
    return {
      id: post.id,
      url: post.link,
      status: post.status
    };
  } catch (error) {
    console.error('Error details:', error);
    throw new Error(`Failed to post to WordPress: ${error.message}`);
  }
}

// Type-safe function registry
const myFunctions: FunctionRegistryType = {
  MyCustomFunction
};


const main = async () => {
  // Create crew with type checking
  const crew = new AxCrew(config);

  // Type-safe state management
  // crew.state.set('key', 'value');
  // const value: string = crew.state.get('key');

  // Type-safe agent management
  const agents = crew.addAgentsToCrew(['SearchQueryGenerator', 'GoogleSearch', 'BlogPostWriter']);
  const planner = agents?.get('SearchQueryGenerator');
  const googleSearch = agents?.get('GoogleSearch');
  const writer = agents?.get('BlogPostWriter');

  const topic = "a how to guide on manifesting a new reality in your life using Neville Goddard's teachings";
  const guidance = "The article should help the reader to implement the visualization techniques for manifesting their new realities. Make the article fun and engaging.";

  if (planner && googleSearch && writer) {
    // Type-safe agent usage
    const plannerResponse = await planner.forward({ topic, guidance });
    const { googleSearchQueries } = plannerResponse;

    const googleSearchResults: string[] = [];
    for (const query of googleSearchQueries) {
      const googleSearchResponse = await googleSearch.forward({ googleSearchQuery: query });
      const { googleSearchResult } = googleSearchResponse;
      googleSearchResults.push(googleSearchResult);
    }


    const writerResponse = await writer.forward({ topic, guidance, googleSearchResults });
    const { blogPostTitle, blogPostContent } = writerResponse;

    console.log(blogPostTitle);
    console.log(blogPostContent);

    // Post to WordPress
    try {
      const postResponse = await postToWordPress(blogPostTitle, blogPostContent, 'publish');
      console.log('Successfully posted to WordPress:', postResponse);
    } catch (error) {
      console.error('Failed to post to WordPress:', error);
    }
  }
}

main();
