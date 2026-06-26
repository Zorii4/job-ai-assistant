import type { CriticDecision } from "../types/jobApplication.js";

export function parseCriticDecision(output: string): CriticDecision {
  const normalizedOutput = output.toUpperCase();
  const decisionMatch = normalizedOutput.match(
    /(?:DECISION|VERDICT|STATUS)\s*:\s*(APPROVED|NEEDS_REVISION|REVISION_REQUIRED|REJECTED)/
  );

  if (decisionMatch?.[1]) {
    return decisionMatch[1] as CriticDecision;
  }

  for (const decision of ["REVISION_REQUIRED", "NEEDS_REVISION", "APPROVED", "REJECTED"] as const) {
    if (normalizedOutput.includes(decision)) {
      return decision;
    }
  }

  return "UNKNOWN";
}
