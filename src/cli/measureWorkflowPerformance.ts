import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AnalyzeJobApplicationMeta, JobApplicationAgentName } from "../types/jobApplication.js";

const runsDirectory = resolve(process.cwd(), "output", "runs");
const measuredStages: JobApplicationAgentName[] = [
  "analyst",
  "producer.v1",
  "critic.v1",
  "orchestrator.final"
];

type StoredRunMeta = AnalyzeJobApplicationMeta & {
  steps: Array<{
    agentName: JobApplicationAgentName;
    durationMs: number;
    attemptCount?: number;
    retryErrorCodes?: string[];
  }>;
};

type PercentileSummary = {
  samples: number;
  p50Ms: number;
  p95Ms: number;
};

async function main(): Promise<void> {
  const runs = await loadCompletedRuns();

  if (runs.length === 0) {
    throw new Error("No completed non-mock runs are available for performance measurement.");
  }

  const stageMetrics = Object.fromEntries(
    measuredStages.map((stage) => [
      stage,
      summarize(runs.flatMap((run) => run.steps.filter((step) => step.agentName === stage).map((step) => step.durationMs)))
    ])
  );
  const workflowDurations = runs.map((run) => {
    const startedAt = Date.parse(run.startedAt);
    const finishedAt = Date.parse(run.finishedAt);

    return finishedAt - startedAt;
  });
  const retryingSteps = runs.flatMap((run) => run.steps).filter((step) => (step.attemptCount ?? 1) > 1);

  console.log(
    JSON.stringify(
      {
        source: "local saved run metadata",
        successfulNonMockRuns: runs.length,
        percentileMethod: "nearest-rank",
        workflow: summarize(workflowDurations),
        stages: stageMetrics,
        retryingSteps: retryingSteps.length,
        totalRecordedAttempts: runs
          .flatMap((run) => run.steps)
          .reduce((total, step) => total + (step.attemptCount ?? 1), 0)
      },
      null,
      2
    )
  );
}

async function loadCompletedRuns(): Promise<StoredRunMeta[]> {
  const entries = await readdir(runsDirectory, { withFileTypes: true });
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const raw = await readFile(join(runsDirectory, entry.name, "meta.json"), "utf8");

        return JSON.parse(raw) as StoredRunMeta;
      })
  );

  return runs.filter((run) => !run.llmMock && run.finalDecision === "APPROVED" && !run.error);
}

function summarize(values: number[]): PercentileSummary {
  if (values.length === 0) {
    return { samples: 0, p50Ms: 0, p95Ms: 0 };
  }

  const ordered = [...values].sort((left, right) => left - right);

  return {
    samples: ordered.length,
    p50Ms: nearestRank(ordered, 0.5),
    p95Ms: nearestRank(ordered, 0.95)
  };
}

function nearestRank(orderedValues: number[], percentile: number): number {
  const index = Math.max(0, Math.ceil(percentile * orderedValues.length) - 1);

  return orderedValues[index];
}

await main();
