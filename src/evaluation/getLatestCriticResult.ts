import { criticResultSchema, type CriticResult } from "../contracts/critic.contract.js";
import type { JobApplicationStep } from "../types/jobApplication.js";

export function getLatestCriticResult(steps: JobApplicationStep[]): CriticResult {
  const criticStep = [...steps].reverse().find((step) => step.agentName.startsWith("critic."));

  if (!criticStep) {
    throw new Error("Evaluation result does not contain a Critic step.");
  }

  let rawResult: unknown;

  try {
    rawResult = JSON.parse(criticStep.output);
  } catch {
    throw new Error("Evaluation Critic step does not contain valid JSON.");
  }

  const parsedResult = criticResultSchema.safeParse(rawResult);

  if (!parsedResult.success) {
    throw new Error("Evaluation Critic step does not match CriticResult schema.");
  }

  return parsedResult.data;
}
