import { z } from "zod";

const criticIssueSchema = z
  .object({
    category: z.enum(["Strategy", "Facts", "Vacancy", "ATS", "Consistency", "Communication", "Structure"]),
    severity: z.enum(["CRITICAL", "WARNING", "INFO"]),
    problem: z.string().min(1).max(800),
    reason: z.string().min(1).max(800),
    requiredAction: z.string().min(1).max(800),
    reference: z.string().min(1).max(500)
  })
  .strict();

const claimClassificationSchema = z.enum([
  "DIRECT",
  "SAFE_PARAPHRASE",
  "SUPPORTED_AMPLIFICATION",
  "SUPPORTED_INFERENCE",
  "CONDITIONAL",
  "UNSUPPORTED",
  "MATERIAL_MISREPRESENTATION"
]);

const criticSeveritySchema = z.enum(["CRITICAL", "WARNING", "INFO"]);

const claimAuditEvidenceSchema = z
  .object({
    source: z.enum(["resume", "vacancy"]),
    quote: z.string().min(1).max(700)
  })
  .strict();

const claimAuditEntrySchema = z
  .object({
    claim: z.string().min(1).max(700),
    material: z.enum(["Analysis", "Resume", "ResumeRecommendations", "CoverLetter", "RecruiterMessage", "FollowUp"]),
    classification: claimClassificationSchema,
    severity: criticSeveritySchema,
    evidence: z.array(claimAuditEvidenceSchema).max(2),
    reason: z.string().min(1).max(800),
    requiredAction: z.string().max(800)
  })
  .strict()
  .superRefine((entry, context) => {
    const requiresEvidence = ![
      "UNSUPPORTED",
      "MATERIAL_MISREPRESENTATION"
    ].includes(entry.classification);
    const requiresAction = entry.severity === "CRITICAL" || entry.classification === "MATERIAL_MISREPRESENTATION";

    if (requiresEvidence && entry.evidence.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: "evidence is required for supported and conditional claims"
      });
    }

    if (requiresAction && entry.requiredAction.trim().length === 0) {
      context.addIssue({
        code: "custom",
        path: ["requiredAction"],
        message: "requiredAction is required for critical claims and material misrepresentation"
      });
    }

    if (entry.classification === "MATERIAL_MISREPRESENTATION" && entry.severity !== "CRITICAL") {
      context.addIssue({
        code: "custom",
        path: ["severity"],
        message: "material misrepresentation must be CRITICAL"
      });
    }

    if (
      entry.severity === "CRITICAL" &&
      !["UNSUPPORTED", "MATERIAL_MISREPRESENTATION"].includes(entry.classification)
    ) {
      context.addIssue({
        code: "custom",
        path: ["classification"],
        message: "critical claims must be unsupported or material misrepresentation"
      });
    }
  });

export const criticFindingsSchema = z
  .object({
    schemaVersion: z.literal(3),
    issues: z.array(criticIssueSchema).max(12),
    claimAudit: z.array(claimAuditEntrySchema).min(1).max(16),
    summary: z.string().min(1).max(1_500)
  })
  .strict();

export type CriticFindings = z.infer<typeof criticFindingsSchema>;

export const criticResultSchema = criticFindingsSchema
  .extend({
    decision: z.enum(["APPROVED", "NEEDS_REVISION"]),
    reviewStatus: z.enum(["GOOD", "NEEDS_REVIEW", "REJECTED"])
  })
  .superRefine((result, context) => {
    const criticalIssues = result.issues.filter((issue) => issue.severity === "CRITICAL");
    const criticalClaims = result.claimAudit.filter((entry) => entry.severity === "CRITICAL");
    const hasCriticalFinding = criticalIssues.length > 0 || criticalClaims.length > 0;
    const hasWarning =
      result.issues.some((issue) => issue.severity === "WARNING") ||
      result.claimAudit.some((entry) => entry.severity === "WARNING");

    if (result.decision === "APPROVED" && hasCriticalFinding) {
      context.addIssue({
        code: "custom",
        path: ["decision"],
        message: "APPROVED cannot contain critical findings"
      });
    }

    if (result.decision === "NEEDS_REVISION" && !hasCriticalFinding) {
      context.addIssue({
        code: "custom",
        path: ["decision"],
        message: "NEEDS_REVISION requires a critical finding"
      });
    }

    if (result.reviewStatus === "REJECTED" && !hasCriticalFinding) {
      context.addIssue({
        code: "custom",
        path: ["reviewStatus"],
        message: "REJECTED requires a critical finding"
      });
    }

    if (result.reviewStatus !== "REJECTED" && hasCriticalFinding) {
      context.addIssue({
        code: "custom",
        path: ["reviewStatus"],
        message: "critical findings require REJECTED review status"
      });
    }

    if (result.reviewStatus === "GOOD" && hasWarning) {
      context.addIssue({
        code: "custom",
        path: ["reviewStatus"],
        message: "warning findings require NEEDS_REVIEW review status"
      });
    }
  });

export type CriticResult = z.infer<typeof criticResultSchema>;

/**
 * decision and reviewStatus are deterministic summaries of Critic findings,
 * not additional model judgements. Producing them here makes their
 * relationship to severity correct by construction.
 */
export function finalizeCriticResult(findings: CriticFindings): CriticResult {
  const hasCriticalFinding =
    findings.issues.some((issue) => issue.severity === "CRITICAL") ||
    findings.claimAudit.some((entry) => entry.severity === "CRITICAL");
  const hasWarning =
    findings.issues.some((issue) => issue.severity === "WARNING") ||
    findings.claimAudit.some((entry) => entry.severity === "WARNING");

  return {
    ...findings,
    decision: hasCriticalFinding ? "NEEDS_REVISION" : "APPROVED",
    reviewStatus: hasCriticalFinding ? "REJECTED" : hasWarning ? "NEEDS_REVIEW" : "GOOD"
  };
}
