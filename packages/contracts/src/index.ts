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
  'ANALYSIS_QUOTA_EXCEEDED',
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

export const VacancySourceTypeSchema = z.enum(['TEXT', 'FILE']);
export const ApplicationCaseStatusSchema = z.enum([
  'DRAFT',
  'ANALYZING',
  'ANALYSIS_READY',
  'FAILED',
]);

export const CreateApplicationCaseRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    resumeId: z.string().trim().min(1).max(128),
    vacancyText: z.string().trim().min(1).max(50_000),
  })
  .strict();

export type CreateApplicationCaseRequest = z.infer<typeof CreateApplicationCaseRequestSchema>;

export const CreateApplicationCaseFileRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    resumeId: z.string().trim().min(1).max(128),
  })
  .strict();

export type CreateApplicationCaseFileRequest = z.infer<typeof CreateApplicationCaseFileRequestSchema>;

export const ApplicationCaseSummarySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    resumeId: z.string().min(1),
    vacancySourceType: VacancySourceTypeSchema,
    status: ApplicationCaseStatusSchema,
    currentStage: z.literal('DRAFT'),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ApplicationCaseSummary = z.infer<typeof ApplicationCaseSummarySchema>;

export const ApplicationCaseResponseSchema = z
  .object({
    schemaVersion: z.literal(API_SCHEMA_VERSION),
    applicationCase: ApplicationCaseSummarySchema,
  })
  .strict();

export const AnalysisRunStatusSchema = z.enum(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED']);

export const AnalysisRunSummarySchema = z
  .object({
    id: z.string().min(1),
    applicationCaseId: z.string().min(1),
    workflowType: z.literal('INITIAL_ANALYSIS'),
    status: AnalysisRunStatusSchema,
    currentStage: z.string().min(1).nullable(),
    errorCode: z.string().min(1).max(128).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type AnalysisRunSummary = z.infer<typeof AnalysisRunSummarySchema>;

export const AnalysisRunResponseSchema = z
  .object({
    schemaVersion: z.literal(API_SCHEMA_VERSION),
    analysisRun: AnalysisRunSummarySchema,
  })
  .strict();

export const InitialAnalysisResultSchema = z
  .object({
    id: z.string().min(1),
    applicationCaseId: z.string().min(1),
    finalMarkdown: z.string().min(1),
  })
  .strict();

export type InitialAnalysisResult = z.infer<typeof InitialAnalysisResultSchema>;

export const InitialAnalysisResultResponseSchema = z
  .object({
    schemaVersion: z.literal(API_SCHEMA_VERSION),
    analysisResult: InitialAnalysisResultSchema,
  })
  .strict();

export const ArtifactTypeSchema = z.enum([
  'RESUME_RECOMMENDATIONS',
  'COVER_LETTER',
  'RECRUITER_MESSAGE',
  'FOLLOW_UP',
]);

export const ArtifactSummarySchema = z.object({
  id: z.string().min(1),
  applicationCaseId: z.string().min(1),
  type: ArtifactTypeSchema,
  generatedContent: z.string().min(1),
  editedContent: z.string().min(1).nullable(),
  updatedAt: z.string().datetime(),
}).strict();

export type ArtifactSummary = z.infer<typeof ArtifactSummarySchema>;

export const UpdateArtifactRequestSchema = z.object({
  editedContent: z.string().trim().min(1).max(50_000),
}).strict();

export type UpdateArtifactRequest = z.infer<typeof UpdateArtifactRequestSchema>;

export const ArtifactListResponseSchema = z.object({
  schemaVersion: z.literal(API_SCHEMA_VERSION),
  artifacts: z.array(ArtifactSummarySchema),
}).strict();

export const ArtifactResponseSchema = z.object({
  schemaVersion: z.literal(API_SCHEMA_VERSION),
  artifact: ArtifactSummarySchema,
}).strict();

export const InitialAnalysisJobPayloadSchema = z
  .object({
    applicationCaseId: z.string().min(1).max(128),
    analysisRunId: z.string().min(1).max(128),
  })
  .strict();

export type InitialAnalysisJobPayload = z.infer<typeof InitialAnalysisJobPayloadSchema>;
