import { AxCrew } from "../dist/index.js";
import { AxCrewFunctions } from "../dist/functions/index.js";
import type { AxCrewConfig } from "../dist/index.js";
import type { Provider } from "../dist/types.js";
import dotenv from "dotenv";
dotenv.config();

const config: AxCrewConfig = {
  crew: [
    {
      name: "writer",
      description: "A writing agent that creates content",
      signature: "topic:string -> article:string",
      provider: "openai" as Provider,
      providerKeyName: "OPENAI_API_KEY",
      ai: { model: "gpt-4o", temperature: 0.3 },
      options: { debug: true },
      // Minimal examples usable for offline compile when metric is resolved
      examples: [
        { topic: "Quantum", article: "Short article about Quantum." },
        { topic: "AI", article: "Short article about AI." },
      ],
      ace: {
        enabled: true,
        teacher: { provider: "openai" as Provider, providerKeyName: "OPENAI_API_KEY", ai: { model: "gpt-4o" } },
        options: { maxEpochs: 1, allowDynamicSections: true, tokenBudget: 4000 },
        persistence: { playbookPath: "playbooks/writer.json", autoPersist: true },
        metric: { metricFnName: "writerMetric", primaryOutputField: "article" },
        compileOnStart: false,
      },
    },
  ],
};

// Example metric function placed in registry by name
function writerMetric({ prediction, example }: any): number {
  try {
    return prediction?.article?.length > 0 && example?.article?.length > 0 ? 1 : 0;
  } catch { return 0; }
}

async function main() {
  const crew = new AxCrew(config, { ...AxCrewFunctions, writerMetric });

  await crew.addAgentsToCrew(["writer"]);
  const writer = crew.agents?.get("writer");

  // Offline compile (if metric resolved)
  await writer?.optimizeOffline();

  // Online run + update
  const prediction = await writer?.forward({ topic: "Quantum" });
  await writer?.applyOnlineUpdate({ example: { topic: "Quantum" }, prediction, feedback: "Too verbose." });

  console.log("Playbook:", (writer as any)?.getPlaybook?.());

  crew.destroy();
}

main().catch(console.error);
