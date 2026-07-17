import { z } from "zod";

const criticIssueSchema = z
  .object({
    category: z.enum(["Strategy", "Facts", "Vacancy", "ATS", "Consistency", "Communication"]),
    severity: z.enum(["Critical", "Major", "Minor"]),
    problem: z.string().min(1),
    reason: z.string().min(1),
    requiredAction: z.string().min(1),
    reference: z.string().min(1)
  })
  .strict();

export const criticResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    decision: z.enum(["APPROVED", "NEEDS_REVISION"]),
    issues: z.array(criticIssueSchema),
    summary: z.string().min(1)
  })
  .strict()
  .superRefine((result, context) => {
    if (result.decision === "APPROVED" && result.issues.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["issues"],
        message: "issues must be empty when decision is APPROVED"
      });
    }

    if (result.decision === "NEEDS_REVISION" && result.issues.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["issues"],
        message: "at least one issue is required when decision is NEEDS_REVISION"
      });
    }
  });

export type CriticResult = z.infer<typeof criticResultSchema>;
