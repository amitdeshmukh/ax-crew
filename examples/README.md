# AxCrew Examples

This directory contains example implementations showing how to use AxCrew in different scenarios. Each example demonstrates specific features and use cases.

## Prerequisites

Before running any example, make sure you have:

1. Node.js >= 21.0.0 installed
2. Required API keys set in your `.env` file:
   ```env
   ANTHROPIC_API_KEY=your_anthropic_key
   OPENAI_API_KEY=your_openai_key
   GEMINI_API_KEY=your_gemini_key
   # Add other provider keys as needed
   ```

## Additional Dependencies

Some examples require additional npm modules. Install them based on which examples you want to run:

```bash
# For WordPress example
npm install node-fetch https
```

## Examples

### 1. Basic Researcher-Writer
[`basic-researcher-writer.ts`](./basic-researcher-writer.ts)

Demonstrates how to create a simple crew with two agents:
- A researcher agent that finds information
- A writer agent that creates content based on the research

**Required Dependencies:** None beyond core package

```typescript
import { AxCrew } from "@amitdeshmukh/ax-crew";

const crew = new AxCrew({
  crew: [
    {
      name: "researcher",
      // ... configuration
    },
    {
      name: "writer",
      // ... configuration
    }
  ]
});

// Usage example in the file
```

### 2. Solve Math Problem
[`solve-math-problem.ts`](./solve-math-problem.ts)

Shows how to use the math-solving capabilities with step-by-step explanations:
- Uses Gemini Pro for code execution
- Demonstrates how to handle complex mathematical queries
- Shows usage cost tracking

**Required Dependencies:** 
```bash
npm install mathjs
```

```typescript
const userQuery = "who is considered as the father of the iphone and what is the 7th root of their year of birth?";
// See file for implementation
```

### 3. Write and Publish to WordPress
[`write-post-and-publish-to-wordpress.ts`](./write-post-and-publish-to-wordpress.ts)

Demonstrates how to:
- Create content using AI
- Format it for WordPress
- Publish directly to a WordPress site
- Handle API interactions

**Required Dependencies:**
```bash
npm install @wordpress/api-fetch @wordpress/url
```

**Additional Configuration:**
```env
WORDPRESS_URL=your_wordpress_site_url
WORDPRESS_USERNAME=your_username
WORDPRESS_APP_PASSWORD=your_application_password
```

### 4. MCP Agent with Google Maps
[`mcp-agent.ts`](./mcp-agent.ts)

Shows how to use Model Context Protocol (MCP) servers to integrate external APIs:
- Uses Google Maps API through MCP server
- Demonstrates agent dependencies (ManagerAgent using MapsAgent)
- Shows how to handle location-based queries
- Includes cost tracking across multiple agents

**Required Dependencies:**
```bash
npm install @modelcontextprotocol/server-google-maps
```

**Additional Configuration:**
```env
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
GOOGLE_MAPS_API_KEY=your_google_maps_key
```

```typescript
const userQuery = "Are there any cool bars around the Eiffel Tower  within 5 min walking distance";
```

Key features:
- Integration with external APIs via MCP servers
- Cost tracking across agents

### 5. ACE Flight Assistant (Feedback Learning)
[`ace-feedback-routing.ts`](./ace-feedback-routing.ts)

Demonstrates ACE (Agentic Context Engineering) learning from user feedback:
- A flight booking assistant using Google Flights MCP server
- Real-time playbook updates based on user feedback
- Persistence of learned preferences across sessions
- Interactive CLI for flight queries

**Required Setup:**
```bash
# Clone the Google Flights MCP server
git clone https://github.com/opspawn/Google-Flights-MCP-Server.git
cd Google-Flights-MCP-Server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && playwright install

# Set environment variable
export GOOGLE_FLIGHTS_SERVER_PATH=/path/to/server.py
```

Key features:
- ACE feedback loop integration
- Playbook persistence to JSON
- Learning from natural language feedback

### 6. ACE Customer Support (Edge Case Learning)
[`ace-customer-support.ts`](./ace-customer-support.ts)

Shows how ACE learns to handle edge cases beyond standard policies:
- A customer support agent with predefined company policies
- Learning exceptions from supervisor feedback (e.g., "loyal customers get extended returns")
- Applying learned exceptions to similar future cases
- Interactive ticket handling demo

**Required Dependencies:** None beyond core package

```typescript
// Example feedback that teaches the agent:
// "For loyal customers (5+ years), extend return window to 60 days"
// "Medical emergencies justify extended deadlines"
// "Defective products override 'final sale' policy"
```

Key features:
- Edge case learning from feedback
- Policy exception handling
- Playbook persistence showing learned rules
- Sample tickets demonstrating various scenarios

## Running the Examples

1. Clone the repository:
   ```bash
   git clone https://github.com/amitdeshmukh/ax-crew.git
   ```

2. Install dependencies:
   ```bash
   cd ax-crew
   npm install
   ```

3. Set up your environment variables in `.env`

4. Run an example:
   ```bash
   # Using ts-node
   npx ts-node examples/basic-researcher-writer.ts

   # Or after building
   npm run build
   node dist/examples/basic-researcher-writer.js
   ```

## Cost Tracking

All examples include cost tracking. You can monitor API usage costs:

```typescript
// Get individual agent costs
const cost = agent.getUsageCost();
console.log("Usage cost:", cost);

// Get aggregated costs for all agents in the crew
const totalCosts = crew.getAggregatedCosts();
console.log("Total costs:", totalCosts);

// Reset cost tracking if needed
crew.resetCosts();
```

## Best Practices

1. Always check for and handle errors appropriately
2. Monitor costs using the built-in cost tracking
3. Use appropriate model temperatures based on your use case
4. Leverage shared state for better agent coordination
5. Consider rate limits of the AI providers
6. When using MCP servers:
   - Secure API keys using environment variables
   - Handle API rate limits appropriately
   - Consider fallback options for API failures

## Contributing

Feel free to contribute more examples by submitting a pull request. Make sure to:
1. Include clear documentation
2. Follow the existing code style
3. Add appropriate error handling
4. Include cost tracking
5. Add your example to this README
6. If using external APIs:
   - Document required API keys
   - Include example environment variables
   - Handle API errors gracefully
