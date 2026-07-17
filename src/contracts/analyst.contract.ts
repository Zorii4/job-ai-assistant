import { z } from "zod";

const scoreSchema = z
  .object({
    score: z.number().int().min(0).max(10),
    reason: z.string().min(1)
  })
  .strict();

const gapSchema = z
  .object({
    requirement: z.string().min(1),
    status: z.enum(["MATCH", "PARTIAL", "GAP", "UNKNOWN"]),
    evidence: z.string().min(1),
    impact: z.string().min(1)
  })
  .strict();

export const analystResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    recommendation: z.enum(["APPLY", "LIKELY_APPLY", "LOW_PRIORITY", "DO_NOT_APPLY"]),
    priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
    verdict: z.string().min(1),
    limitations: z.array(z.string().min(1)),
    scores: z
      .object({
        atsMatch: scoreSchema,
        vacancyMatch: scoreSchema,
        recruiterAppeal: scoreSchema,
        interviewProbability: scoreSchema,
        offerPotential: scoreSchema
      })
      .strict(),
    companyNeeds: z.array(z.string().min(1)),
    companyAnalysis: z.array(z.string().min(1)),
    gaps: z.array(gapSchema),
    strengths: z.array(z.string().min(1)),
    risks: z.array(z.string().min(1)),
    keyRecommendations: z.array(z.string().min(1)),
    additionalImprovements: z.array(z.string().min(1)),
    producerBrief: z
      .object({
        positioning: z.string().min(1),
        mustEmphasize: z.array(z.string().min(1)),
        vacancyKeywords: z.array(z.string().min(1)),
        prohibitedClaims: z.array(z.string().min(1))
      })
      .strict(),
    criticChecklist: z.array(z.string().min(1))
  })
  .strict();

export type AnalystResult = z.infer<typeof analystResultSchema>;
