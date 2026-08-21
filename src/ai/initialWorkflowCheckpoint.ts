import { createHash } from "node:crypto";
import { z } from "zod";

import { analystResultSchema } from "../contracts/analyst.contract.js";
import { criticResultSchema } from "../contracts/critic.contract.js";
import type { InitialAnalysisWorkflowConfig } from "./runInitialAnalysisWorkflow.js";

export const initialWorkflowCheckpointSchema = z
  .object({
    schemaVersion: z.literal(1),
    analystResult: analystResultSchema,
    latestProducerOutput: z.string().min(1).optional(),
    latestProducerVersion: z.number().int().min(1).max(3).optional(),
    latestCriticResult: criticResultSchema.optional(),
    finalMarkdown: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((checkpoint, context) => {
    const hasProducer = checkpoint.latestProducerOutput !== undefined;
    const hasProducerVersion = checkpoint.latestProducerVersion !== undefined;

    if (hasProducer !== hasProducerVersion) {
      context.addIssue({ code: "custom", message: "producer output and version must be saved together" });
    }

    if (checkpoint.latestCriticResult !== undefined && !hasProducer) {
      context.addIssue({ code: "custom", message: "critic output requires a producer output" });
    }

    if (checkpoint.finalMarkdown !== undefined && checkpoint.latestCriticResult?.decision !== "APPROVED") {
      context.addIssue({ code: "custom", message: "final output requires an approved critic result" });
    }
  });

export type InitialWorkflowCheckpoint = z.infer<typeof initialWorkflowCheckpointSchema>;

export function getInitialWorkflowCheckpointFingerprint(
  config: InitialAnalysisWorkflowConfig,
  prompts: { analyst: string; producer: string; critic: string; orchestrator: string },
  documents: { resumeText: string; vacancyText: string },
): string {
  const source = JSON.stringify({
    analysisMode: config.analysisMode,
    maxRevisionCycles: config.maxRevisionCycles,
    maxProducerVersions: config.maxProducerVersions,
    stepTimeoutMs: config.stepTimeoutMs,
    totalTimeoutMs: config.totalTimeoutMs,
    llmMock: process.env.LLM_MOCK?.toLowerCase() === "true",
    models: {
      primary: process.env.LLM_MODEL ?? null,
      analystFallback: process.env.LLM_ANALYST_FALLBACK_MODEL ?? null,
      criticPrimary: process.env.LLM_CRITIC_MODEL ?? null,
      criticFallback: process.env.LLM_CRITIC_FALLBACK_MODEL ?? null,
    },
    promptHashes: Object.fromEntries(
      Object.entries(prompts).map(([name, value]) => [name, createHash("sha256").update(value).digest("hex")]),
    ),
    inputHashes: {
      resume: createHash("sha256").update(documents.resumeText).digest("hex"),
      vacancy: createHash("sha256").update(documents.vacancyText).digest("hex"),
    },
  });

  return createHash("sha256").update(source).digest("hex");
}
