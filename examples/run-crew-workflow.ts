import 'dotenv/config';
import { AxCrew } from '../dist/index.js';
import type { AxCrewConfig } from '../dist/types.js';

const config: AxCrewConfig = {
  crew: [
    {
      name: 'WorkflowAgent',
      description: `You answer questions by querying databases and running calculations.

IMPORTANT — follow this strategy for database queries:
1. FIRST call list_workflows to check if a reusable workflow already exists for this type of question.
2. If a matching workflow exists, call execute_workflow with its name. Done!
3. If NO matching workflow exists:
   a. Call get_js_runtime_api to learn the available gj.tools.* functions
   b. Call list_tables and describe_table to understand the schema
   c. Author a JavaScript workflow that uses gj.tools.* to query the database and compute results server-side
   d. Call save_workflow to persist it (use descriptive snake_case name and description for future discovery)
   e. Call execute_workflow to run it
4. Synthesize the answer from the workflow results.

This approach runs ALL database queries server-side in a single call, avoiding multiple round-trips.
The saved workflow will be reusable by future queries asking similar questions.`,
      signature:
        'background:string "background information and context", question:string "the user question to answer" -> answer:string "the answer with explanation", references:json "list of references, each with fileName and url"',
      provider: 'anthropic',
      providerKeyName: 'ANTHROPIC_API_KEY',
      ai: {
        model: 'claude-sonnet-4-6',
        temperature: 0,
      },
      options: {
        debug: true,
      },
      mcpServers: {
        graphjin: {
          mcpEndpoint: 'http://localhost:8080/api/v1/mcp',
          tools: [
            'list_workflows', 'save_workflow', 'execute_workflow',
            'get_js_runtime_api', 'list_tables', 'describe_table',
            'get_query_syntax', 'execute_graphql',
          ],
        },
      },
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  await crew.addAllAgents();

  const agent = crew.agents?.get('WorkflowAgent');
  if (!agent) throw new Error('WorkflowAgent not found');

  const query =
    'Which customers have overdue or unpaid invoices? Show me a table with each customer, how many invoices they owe on, and the total outstanding balance.';
  console.log(`\nQuery: ${query}\n`);

  const result = await agent.forward({
    background: 'User is querying the system about customer accounts receivable.',
    question: query,
  });

  console.log(`\nAnswer: ${result.answer}`);
  console.log(`\nReferences:`, JSON.stringify(result.references, null, 2));

  const metrics = (agent as any).getMetrics?.();
  console.log(`\nMetrics:`, JSON.stringify(metrics, null, 2));

  crew.destroy();
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
