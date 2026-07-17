import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { analyzeJobApplication } from "../app/analyzeJobApplication.js";

const controlCasesDir = resolve(process.cwd(), "evaluation", "control-cases");
const evaluationResultsDir = resolve(process.cwd(), "evaluation", "results");
const requiredCaseFiles = ["resume.sanitized.md", "vacancy.sanitized.md", "expectations.md"];

type CaseSummary = {
  caseId: string;
  status: "SUCCEEDED" | "FAILED";
  durationMs: number;
  llmCalls?: number;
  finalDecision?: string;
  revisionCyclesUsed?: number;
  errorCode?: string;
};

async function main(): Promise<void> {
  process.env.SAVE_INPUT_TEXT = "false";

  if (process.env.LLM_MOCK?.toLowerCase() === "true") {
    throw new Error("Control evaluation requires a real LLM. Set LLM_MOCK=false.");
  }

  const caseDirectories = await getCaseDirectories(process.argv.slice(2));

  if (caseDirectories.length === 0) {
    throw new Error("No control cases found in evaluation/control-cases.");
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(evaluationResultsDir, runId);
  const summaries: CaseSummary[] = [];

  await mkdir(runDir, { recursive: true });

  for (const caseId of caseDirectories) {
    const startedAt = Date.now();
    const caseDir = join(controlCasesDir, caseId);
    const caseResultDir = join(runDir, caseId);

    console.log(`[evaluation] ${caseId}: starting`);

    try {
      await validateCaseFiles(caseDir);
      const [resumeText, vacancyText] = await Promise.all([
        readFile(join(caseDir, "resume.sanitized.md"), "utf8"),
        readFile(join(caseDir, "vacancy.sanitized.md"), "utf8")
      ]);
      const result = await analyzeJobApplication({
        resumeText,
        vacancyText,
        source: "cli"
      });
      const summary: CaseSummary = {
        caseId,
        status: "SUCCEEDED",
        durationMs: Date.now() - startedAt,
        llmCalls: result.steps.length,
        finalDecision: result.meta.finalDecision,
        revisionCyclesUsed: result.meta.revisionCyclesUsed
      };

      await mkdir(caseResultDir, { recursive: true });
      await Promise.all([
        writeFile(join(caseResultDir, "final.md"), `${result.finalMarkdown}\n`, "utf8"),
        writeFile(join(caseResultDir, "metrics.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8")
      ]);
      summaries.push(summary);
      console.log(
        `[evaluation] ${caseId}: completed in ${summary.durationMs}ms, llmCalls=${summary.llmCalls}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const summary: CaseSummary = {
        caseId,
        status: "FAILED",
        durationMs: Date.now() - startedAt,
        errorCode: toErrorCode(message)
      };

      await mkdir(caseResultDir, { recursive: true });
      await writeFile(join(caseResultDir, "metrics.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      summaries.push(summary);
      console.error(`[evaluation] ${caseId}: failed with ${summary.errorCode}`);
    }
  }

  await writeFile(join(runDir, "summary.json"), `${JSON.stringify(summaries, null, 2)}\n`, "utf8");

  const failedCount = summaries.filter((summary) => summary.status === "FAILED").length;
  console.log(`[evaluation] completed: ${summaries.length - failedCount}/${summaries.length} cases succeeded`);

  if (failedCount > 0) {
    process.exitCode = 1;
  }
}

async function getCaseDirectories(requestedCaseIds: string[]): Promise<string[]> {
  const entries = await readdir(controlCasesDir, { withFileTypes: true });
  const availableCaseIds = entries
    .filter((entry) => entry.isDirectory() && /^case-\d+$/.test(entry.name))
    .map((entry) => entry.name);

  if (requestedCaseIds.length === 0) {
    return availableCaseIds.sort((left, right) => left.localeCompare(right));
  }

  const uniqueRequestedCaseIds = [...new Set(requestedCaseIds)];
  const invalidCaseIds = uniqueRequestedCaseIds.filter(
    (caseId) => !/^case-\d+$/.test(caseId) || !availableCaseIds.includes(caseId)
  );

  if (invalidCaseIds.length > 0) {
    throw new Error(`Unknown control case ids: ${invalidCaseIds.join(", ")}.`);
  }

  return uniqueRequestedCaseIds.sort((left, right) => left.localeCompare(right));
}

async function validateCaseFiles(caseDir: string): Promise<void> {
  await Promise.all(requiredCaseFiles.map((fileName) => access(join(caseDir, fileName))));
}

function toErrorCode(message: string): string {
  if (message.includes("timed out")) {
    return "LLM_TIMEOUT";
  }

  if (message.includes("LLM returned") || message.includes("LLM response contains")) {
    return "LLM_RESPONSE_INVALID";
  }

  return "EVALUATION_RUN_FAILED";
}

await main();
