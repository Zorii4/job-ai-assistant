import { resolve } from "node:path";
import { readInputFile } from "../files/readInputFile.js";
import { analyzeJobApplication } from "../legacy/analyzeJobApplication.js";
import { getRunResultDirectory } from "../files/saveRunResult.js";
import { classifyLlmError } from "../llm/retryTransientRequest.js";

const dataDir = resolve(process.cwd(), "data");

async function main(): Promise<void> {
  try {
    console.log("[cli] reading input files");
    const resumeText = await readInputFile(dataDir, "resume");
    const vacancyText = await readInputFile(dataDir, "vacancy");

    const result = await analyzeJobApplication({
      resumeText,
      vacancyText,
      source: "cli"
    });

    const runDir = getRunResultDirectory(result.meta.runId);

    console.log(`[cli] done: ${runDir}`);
  } catch (error) {
    console.error(`[cli] failed: ${classifyLlmError(error)}`);
    process.exitCode = 1;
  }
}

await main();
