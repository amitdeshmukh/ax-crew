// NOTE: For a more complete example of a crew that can research a topic, write a post and publish to WordPress, please see ./write-post-and-publish-to-wordpress.ts

import { AxCrew } from "../dist/index.js";
import type { FunctionRegistryType } from "../dist/index.js";
import { WordPressPost } from "@ax-crew/tools-wordpress";

// AxCrew configuration
const config = {
  crew: [
    {
      name: "SearchQueryGenerator",
      description: "Generates a list of google search queries to help research the topic",
      signature: "topic:string \"The topic of the blog post\", guidance:string \"guidance from the user on what the blog post should be about\" -> googleSearchQueries:string[] \"an array of upto 5 google search queries to help research the topic\"",
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
        model: "gemini-1.5-pro",
        temperature: 0.5
      },
      options: {
        debug: true,
        stream: false,
        googleSearchRetrieval: {
          mode: "MODE_UNSPECIFIED"
        }
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
    },
    {
      name: "WordPressPoster",
      description: "Creates a post on WordPress with the given title, content and status",
      signature: "blogPostTitle:string \"the title of the blog post\", blogPostContent:string \"the content of the blog post.\", status:string \"the status of the post (draft, publish, private)\" -> postResponse:string \"the response from the WordPress API\"",
      provider: "anthropic",
      providerKeyName: "ANTHROPIC_API_KEY",
      ai: {
        model: "claude-3-5-sonnet-20240620",
        temperature: 0
      },
      options: {
        debug: true,
        stream: false
      },
      functions: ["WordPressPost"]
    }
  ]
};

const main = async () => {
  // Create crew with type checking
  const customFunctions: FunctionRegistryType = {
    WordPressPost: WordPressPost
  };
  const crew = new AxCrew(config, customFunctions);

  // Add agents to crew
  const agents = await crew.addAgentsToCrew([
    'SearchQueryGenerator', 
    'GoogleSearch', 
    'BlogPostWriter', 
    'WordPressPoster'
  ]);

  // NOTE: Your Wordpress site needs to have the Basic Auth plugin installed and enabled for the automatic posting to work
  // Refer to https://github.com/WP-API/Basic-Auth?tab=readme-ov-file
  
  // Set environment variables
  crew.state.set("env", {
    WORDPRESS_URL: "http://my-wordpress-site.com",
    WORDPRESS_USERNAME: "my-username",
    WORDPRESS_PASSWORD: "my-password"
  });

  // Get agents from crew
  const planner = agents?.get('SearchQueryGenerator');
  const googleSearch = agents?.get('GoogleSearch');
  const writer = agents?.get('BlogPostWriter');
  const poster = agents?.get('WordPressPoster');

  // Define the topic and guidance
  const topic = "How to tell what your dog is thinking";
  const guidance = "The article should be a fun and engaging article and less that 500 words long. It should help the reader to understand their dog better.";

  if (planner && googleSearch && writer && poster) {
    // Generate search queries
    const plannerResponse = await planner.forward({ topic, guidance });
    const { googleSearchQueries } = plannerResponse;

    // Research the topic
    const googleSearchResults: string[] = [];
    for (const query of googleSearchQueries) {
      const googleSearchResponse = await googleSearch.forward({ googleSearchQuery: query });
      const { googleSearchResult } = googleSearchResponse;
      googleSearchResults.push(googleSearchResult);
      // Wait for 3 seconds between queries to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Write the blog post
    const writerResponse = await writer.forward({ topic, guidance, googleSearchResults });
    const { blogPostTitle, blogPostContent } = writerResponse;

    // Post to WordPress
    try {
      const postResponse = await poster.forward({ blogPostTitle, blogPostContent, status: "publish" });
      console.log('Successfully posted to WordPress:', postResponse);
    } catch (error) {
      console.error('Failed to post to WordPress:', error);
    }
  }
}

main();
