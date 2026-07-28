import { z } from 'zod';

export const API_SCHEMA_VERSION = 1;

export const HealthResponseSchema = z
  .object({
    schemaVersion: z.literal(API_SCHEMA_VERSION),
    status: z.literal('ok'),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ApiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'RESUME_LIMIT_REACHED',
  'INTERNAL_ERROR',
]);

export const ApiErrorResponseSchema = z
  .object({
    schemaVersion: z.literal(API_SCHEMA_VERSION),
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const ResumeSourceTypeSchema = z.enum(['TEXT', 'FILE']);
export const SanitizationStatusSchema = z.enum(['PENDING_REVIEW', 'CONFIRMED']);

export const CreateResumeRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    sourceText: z.string().trim().min(1).max(50_000),
  })
  .strict();

export type CreateResumeRequest = z.infer<typeof CreateResumeRequestSchema>;

export const CreateResumeFileRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
  })
  .strict();

export type CreateResumeFileRequest = z.infer<typeof CreateResumeFileRequestSchema>;

export const ResumeSummarySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    sourceType: ResumeSourceTypeSchema,
    sanitizationStatus: SanitizationStatusSchema,
    confirmedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ResumeSummary = z.infer<typeof ResumeSummarySchema>;

export const ResumeDetailSchema = ResumeSummarySchema.extend({
  sanitizedText: z.string().min(1).max(50_000),
  sanitizationVersion: z.string().min(1),
}).strict();

export type ResumeDetail = z.infer<typeof ResumeDetailSchema>;

export const UpdateSanitizedResumeRequestSchema = z
  .object({
    sanitizedText: z.string().trim().min(1).max(50_000),
  })
  .strict();

export type UpdateSanitizedResumeRequest = z.infer<typeof UpdateSanitizedResumeRequestSchema>;

export const ResumeListResponseSchema = z
  .object({
    schemaVersion: z.literal(API_SCHEMA_VERSION),
    resumes: z.array(ResumeSummarySchema),
  })
  .strict();

export const ResumeResponseSchema = z
  .object({
    schemaVersion: z.literal(API_SCHEMA_VERSION),
    resume: ResumeSummarySchema,
  })
  .strict();

export const ResumeDetailResponseSchema = z
  .object({
    schemaVersion: z.literal(API_SCHEMA_VERSION),
    resume: ResumeDetailSchema,
  })
  .strict();
