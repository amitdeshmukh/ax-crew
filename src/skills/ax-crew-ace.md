---
name: ax-crew-ace
version: 8.7.2
description: "ACE (Agentic Context Engineering) for AxCrew: feedback loops, online learning, playbook persistence, and optimization."
tags: [ace, agentic-context-engineering, feedback, learning, playbook, online-update, optimize]
---

# ACE (Agentic Context Engineering)

ACE enables agents to learn from human feedback at runtime. Feedback is analyzed, categorized into playbook sections, and injected into the agent's system prompt on every subsequent `forward()` call.

## ACEConfig Shape

```ts
interface ACEConfig {
  teacher?: {
    provider?: Provider;
    providerKeyName?: string;
    apiURL?: string;
    ai?: AxModelConfig & { model: string };
    providerArgs?: Record<string, unknown>;
  };
  persistence?: {
    playbookPath?: string;
    initialPlaybook?: Record<string, any>;
    autoPersist?: boolean;
    onPersist?: (pb: any) => Promise<void> | void;
    onLoad?: () => Promise<any> | any;
  };
  options?: {
    maxEpochs?: number;
    allowDynamicSections?: boolean;
    tokenBudget?: number;
    reflectorPrompt?: string;
    curatorPrompt?: string;
  };
  metric?: {
    metricFnName?: string;
    primaryOutputField?: string;
  };
  compileOnStart?: boolean;
}
```

## Agent-Level ACE API

```ts
// StatefulAxAgent methods:
await agent.initACE(aceConfig);                          // called automatically during addAgent()
await agent.applyOnlineUpdate({ example, prediction, feedback }); // learn from feedback
agent.getPlaybook();                                     // returns current ACEPlaybook
agent.applyPlaybook(playbook);                           // set playbook directly
await agent.optimizeOffline({ metric, examples });       // offline compilation
```

## Crew-Level Feedback Routing

```ts
// AxCrew tracks which agents participated in a task and routes feedback to all of them:
crew.trackAgentExecution(taskId, agentName, input);      // automatic during forward()
crew.recordAgentResult(taskId, agentName, result);       // automatic during forward()
await crew.applyTaskFeedback({ taskId, feedback, strategy: "all" | "primary" | "weighted" });
crew.getTaskAgentInvolvement(taskId);                    // inspect execution history
crew.cleanupOldExecutions(maxAgeMs);                     // prevent memory leaks
```

## Playbook Persistence

Three persistence options (checked in order):
1. `onLoad` callback -- custom async loader
2. `initialPlaybook` -- inline playbook object
3. `playbookPath` -- JSON file on disk (auto-created)

Auto-save: set `autoPersist: true` with `playbookPath` or `onPersist` callback.

## Canonical Pattern

Adapted from `examples/ace-customer-support.ts` -- an agent that learns customer support exception policies from supervisor feedback.

```ts
import { AxCrew } from "ax-crew";
import type { AxCrewConfig, Provider } from "ax-crew";

const config: AxCrewConfig = {
  crew: [
    {
      name: "SupportAgent",
      description: "Customer support agent. Follow company policies strictly.",
      signature: "ticket:string, policies:string[] -> response:string, decision:string",
      provider: "google-gemini" as Provider,
      providerKeyName: "GEMINI_API_KEY",
      ai: { model: "gemini-flash-latest", temperature: 0.7 },
      options: { stream: false },
      ace: {
        teacher: {
          provider: "google-gemini" as Provider,
          providerKeyName: "GEMINI_API_KEY",
          ai: { model: "gemini-flash-latest" },
        },
        options: { maxEpochs: 1, allowDynamicSections: true },
        persistence: {
          playbookPath: "playbooks/support.json",
          autoPersist: true,
        },
        metric: { primaryOutputField: "response" },
        compileOnStart: false,
      },
    },
  ],
};

async function main() {
  const crew = new AxCrew(config);
  await crew.addAgentsToCrew(["SupportAgent"]);
  const agent = crew.agents!.get("SupportAgent")!;

  // Run the agent
  const result = await agent.forward({
    ticket: "Customer wants refund on sale item (defective on arrival)",
    policies: ["No refunds on sale items", "Returns within 30 days only"],
  });

  console.log(result.response, result.decision);

  // Apply feedback -- agent learns for future calls
  const taskId = (result as any)._taskId;
  if (taskId) {
    await crew.applyTaskFeedback({
      taskId,
      feedback: "Defective products must always be refunded regardless of sale status",
      strategy: "all",
    });
  }

  // Or apply directly to agent (without task routing)
  await (agent as any).applyOnlineUpdate({
    example: { ticket: "..." },
    prediction: result,
    feedback: "Medical emergencies extend the 30-day window to 60 days",
  });

  // Inspect learned playbook
  const playbook = (agent as any).getPlaybook();
  console.log(JSON.stringify(playbook, null, 2));

  crew.cleanupOldExecutions(60000);
  crew.destroy();
}

main().catch(console.error);
```

## Do Not Generate

- Do NOT call `initACE()` manually -- it is called automatically when `addAgent()` / `addAgentsToCrew()` detects an `ace` config on the agent.
- Do NOT set `compileOnStart: true` without providing `examples` and a `metric` -- offline compilation requires both.
- Do NOT mutate the playbook object directly -- use `applyOnlineUpdate()` or `applyPlaybook()`.
- Do NOT forget `autoPersist: true` if you want playbook changes saved to disk automatically.
- Do NOT use `strategy: "weighted"` expecting differentiated weights -- it currently behaves the same as `"all"`.

## References

- [ace-customer-support.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/examples/ace-customer-support.ts)
- [src/agents/ace.ts](https://github.com/amitdeshmukh/ax-crew/blob/main/src/agents/ace.ts)
- [AxACE upstream docs](https://axllm.dev/ace/)
