import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { analyzeJobApplication } from "../app/analyzeJobApplication.js";
import { readInputFile } from "../files/readInputFile.js";
import type { AnalyzeJobApplicationResult } from "../types/jobApplication.js";

const dataDir = resolve(process.cwd(), "data");
const outputDir = resolve(process.cwd(), "output");

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

    console.log("[cli] saving run result");
    const runDir = await saveRunResult(result, resumeText, vacancyText);

    console.log(`[cli] done: ${runDir}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[cli] failed: ${message}`);
    process.exitCode = 1;
  }
}

await main();

async function saveRunResult(
  result: AnalyzeJobApplicationResult,
  resumeText: string,
  vacancyText: string
): Promise<string> {
  const runDir = join(outputDir, "runs", result.meta.runId);
  const analystOutput = getRequiredStepOutput(result, "analyst");
  const producerOutput = getRequiredStepOutput(result, "producer");
  const criticOutput = getRequiredStepOutput(result, "critic");

  await mkdir(runDir, { recursive: true });

  await Promise.all([
    writeFile(join(runDir, "input.resume.txt"), `${resumeText}\n`, "utf8"),
    writeFile(join(runDir, "input.vacancy.txt"), `${vacancyText}\n`, "utf8"),
    writeFile(join(runDir, "analyst.md"), `${analystOutput}\n`, "utf8"),
    writeFile(join(runDir, "producer.md"), `${producerOutput}\n`, "utf8"),
    writeFile(join(runDir, "critic.md"), `${criticOutput}\n`, "utf8"),
    writeFile(join(runDir, "final.md"), `${result.finalMarkdown}\n`, "utf8"),
    writeFile(join(runDir, "meta.json"), `${JSON.stringify(createRunMeta(result), null, 2)}\n`, "utf8")
  ]);

  return runDir;
}

function getRequiredStepOutput(result: AnalyzeJobApplicationResult, agentName: string): string {
  const step = result.steps.find((item) => item.agentName === agentName);

  if (!step) {
    throw new Error(`Missing output for ${agentName}.`);
  }

  return step.output;
}

function createRunMeta(result: AnalyzeJobApplicationResult): object {
  return {
    ...result.meta,
    steps: result.steps.map((step) => ({
      agentName: step.agentName,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt
    }))
  };
}
