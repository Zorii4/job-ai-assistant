import { z } from 'zod';

export const API_SCHEMA_VERSION = 1;

export const HealthResponseSchema = z
  .object({
    schemaVersion: z.literal(API_SCHEMA_VERSION),
    status: z.literal('ok'),
  })
  .strict();

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const DeleteAccountRequestSchema = z.object({
  confirmation: z.literal('УДАЛИТЬ АККАУНТ'),
}).strict();

export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;

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

export const ResumeSourceTypeSchema = z.literal('FILE');
export const SanitizationStatusSchema = z.enum(['PENDING_REVIEW', 'CONFIRMED']);

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

export const VacancySourceTypeSchema = z.literal('FILE');
export const ApplicationCaseStatusSchema = z.enum([
  'DRAFT',
  'ANALYZING',
  'ANALYSIS_READY',
  'APPLIED',
  'WAITING_RESPONSE',
  'HR_INVITED',
  'HR_PREPARATION_READY',
  'HR_COMPLETED',
  'REJECTED',
  'OFFER',
  'ARCHIVED',
  'FAILED',
]);

export type ApplicationCaseStatus = z.infer<typeof ApplicationCaseStatusSchema>;

export const CreateApplicationCaseFileRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    resumeId: z.string().trim().min(1).max(128),
    replacementApplicationCaseId: z.string().trim().min(1).max(128).optional(),
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
export const AnalysisWorkflowTypeSchema = z.enum(['INITIAL_ANALYSIS', 'HR_PREPARATION', 'POST_INTERVIEW']);

export const AnalysisRunSummarySchema = z
  .object({
    id: z.string().min(1),
    applicationCaseId: z.string().min(1),
    workflowType: AnalysisWorkflowTypeSchema,
    status: AnalysisRunStatusSchema,
    currentStage: z.string().min(1).nullable(),
    errorCode: z.string().min(1).max(128).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type AnalysisRunSummary = z.infer<typeof AnalysisRunSummarySchema>;

export const ApplicationCaseAnalysisSummarySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    status: ApplicationCaseStatusSchema,
    currentStage: z.string().min(1),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    analysisRun: AnalysisRunSummarySchema.nullable(),
    hrPreparationRun: AnalysisRunSummarySchema.nullable(),
    postInterviewRun: AnalysisRunSummarySchema.nullable(),
  })
  .strict();

export type ApplicationCaseAnalysisSummary = z.infer<typeof ApplicationCaseAnalysisSummarySchema>;

export const UpdateApplicationCaseStageRequestSchema = z.object({
  status: ApplicationCaseStatusSchema,
}).strict();

export type UpdateApplicationCaseStageRequest = z.infer<typeof UpdateApplicationCaseStageRequestSchema>;

export const ApplicationCaseAnalysisListResponseSchema = z
  .object({
    schemaVersion: z.literal(API_SCHEMA_VERSION),
    applicationCases: z.array(ApplicationCaseAnalysisSummarySchema),
  })
  .strict();

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
    editedFinalMarkdown: z.string().min(1).nullable(),
  })
  .strict();

export type InitialAnalysisResult = z.infer<typeof InitialAnalysisResultSchema>;

export const UpdateInitialAnalysisResultRequestSchema = z.object({
  editedFinalMarkdown: z.string().trim().min(1).max(50_000),
}).strict();

export type UpdateInitialAnalysisResultRequest = z.infer<typeof UpdateInitialAnalysisResultRequestSchema>;

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
  'HR_SCREENING_PREPARATION',
  'POST_INTERVIEW_REVIEW',
  'HR_CLOSING_MESSAGE',
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

export const HRPreparationItemSchema = z
  .object({
    question: z.string().trim().min(10).max(400),
    answer: z.string().trim().min(20).max(2_000),
  })
  .strict();

export const HRPreparationResultSchema = z
  .object({
    schemaVersion: z.literal('1'),
    items: z.array(HRPreparationItemSchema).min(5).max(10),
  })
  .strict();

export type HRPreparationResult = z.infer<typeof HRPreparationResultSchema>;

export const PostInterviewMessageMaxLength = 8_000;

export const CreatePostInterviewRequestSchema = z.object({
  hrMessage: z.string().trim().min(1).max(PostInterviewMessageMaxLength),
}).strict();

export type CreatePostInterviewRequest = z.infer<typeof CreatePostInterviewRequestSchema>;

export const PostInterviewResultSchema = z.object({
  schemaVersion: z.literal('1'),
  analysisMarkdown: z.string().trim().min(1),
  hrClosingMessage: z.string().trim().min(1),
}).strict();

export type PostInterviewResult = z.infer<typeof PostInterviewResultSchema>;

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

export const HRPreparationJobPayloadSchema = z
  .object({
    applicationCaseId: z.string().min(1).max(128),
    analysisRunId: z.string().min(1).max(128),
  })
  .strict();

export type HRPreparationJobPayload = z.infer<typeof HRPreparationJobPayloadSchema>;

export const PostInterviewJobPayloadSchema = z.object({
  applicationCaseId: z.string().min(1).max(128),
  analysisRunId: z.string().min(1).max(128),
}).strict();

export type PostInterviewJobPayload = z.infer<typeof PostInterviewJobPayloadSchema>;
