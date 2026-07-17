import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  AnalyzeJobApplicationMeta,
  AnalyzeJobApplicationResult,
  JobApplicationAgentName,
  JobApplicationStep
} from "../types/jobApplication.js";

const outputDir = resolve(process.cwd(), "output");
const runsToKeep = 8;

export async function saveRunResult(
  result: AnalyzeJobApplicationResult,
  resumeText: string,
  vacancyText: string
): Promise<string> {
  const runDir = join(outputDir, "runs", result.meta.runId);

  await mkdir(runDir, { recursive: true });

  const writes = [
    writeFile(join(runDir, "final.md"), `${result.finalMarkdown}\n`, "utf8"),
    writeFile(join(runDir, "meta.json"), `${JSON.stringify(createResultMetaJson(result), null, 2)}\n`, "utf8")
  ];

  if (shouldSaveInputText()) {
    writes.push(
      writeFile(join(runDir, "input.resume.txt"), `${resumeText}\n`, "utf8"),
      writeFile(join(runDir, "input.vacancy.txt"), `${vacancyText}\n`, "utf8")
    );
  }

  for (const step of result.steps) {
    writes.push(writeFile(join(runDir, stepFileName(step.agentName)), `${step.output}\n`, "utf8"));
  }

  await Promise.all(writes);
  await cleanupOldRuns();

  return runDir;
}

export async function initializeRunResult(
  runId: string,
  resumeText: string,
  vacancyText: string
): Promise<string> {
  const runDir = getRunDir(runId);

  await mkdir(runDir, { recursive: true });

  if (shouldSaveInputText()) {
    await Promise.all([
      writeFile(join(runDir, "input.resume.txt"), `${resumeText}\n`, "utf8"),
      writeFile(join(runDir, "input.vacancy.txt"), `${vacancyText}\n`, "utf8")
    ]);
  }

  return runDir;
}

export async function saveRunStepOutput(runId: string, step: JobApplicationStep): Promise<void> {
  const runDir = getRunDir(runId);

  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, stepFileName(step.agentName)), `${step.output}\n`, "utf8");
}

export async function saveRunFinal(runId: string, finalMarkdown: string): Promise<void> {
  const runDir = getRunDir(runId);

  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "final.md"), `${finalMarkdown}\n`, "utf8");
}

export async function saveRunMeta(
  runId: string,
  meta: AnalyzeJobApplicationMeta,
  steps: JobApplicationStep[]
): Promise<void> {
  const runDir = getRunDir(runId);

  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, "meta.json"), `${JSON.stringify(createRunMetaJson(meta, steps), null, 2)}\n`, "utf8");
}

export async function cleanupOldRuns(): Promise<void> {
  const runsDir = join(outputDir, "runs");
  const entries = await readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const runDirectories = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const path = join(runsDir, entry.name);
        const stats = await stat(path);

        return {
          path,
          modifiedAt: stats.mtimeMs
        };
      })
  );

  const oldRuns = runDirectories
    .sort((left, right) => right.modifiedAt - left.modifiedAt)
    .slice(runsToKeep);

  await Promise.all(oldRuns.map((run) => rm(run.path, { recursive: true, force: true })));
}

function shouldSaveInputText(): boolean {
  return process.env.SAVE_INPUT_TEXT?.toLowerCase() !== "false";
}

function getRunDir(runId: string): string {
  return join(outputDir, "runs", runId);
}

function stepFileName(agentName: JobApplicationAgentName): string {
  const extension = agentName === "analyst" || agentName.startsWith("critic.") ? "json" : "md";

  return `${agentName}.${extension}`;
}

function createResultMetaJson(result: AnalyzeJobApplicationResult): object {
  return createRunMetaJson(result.meta, result.steps);
}

function createRunMetaJson(meta: AnalyzeJobApplicationMeta, steps: JobApplicationStep[]): object {
  return {
    ...meta,
    steps: steps.map((step) => ({
      agentName: step.agentName,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      durationMs: step.durationMs,
      inputChars: step.inputChars,
      outputChars: step.outputChars
    }))
  };
}
