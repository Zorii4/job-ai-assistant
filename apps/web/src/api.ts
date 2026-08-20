import {
  ApiErrorResponseSchema,
  ApplicationCaseAnalysisListResponseSchema,
  ApplicationCaseResponseSchema,
  AnalysisRunResponseSchema,
  ArtifactListResponseSchema,
  ArtifactResponseSchema,
  InitialAnalysisResultResponseSchema,
  type ApplicationCaseSummary,
  type ApplicationCaseAnalysisSummary,
  type AnalysisRunSummary,
  type ArtifactSummary,
  type InitialAnalysisResult,
  type ApiErrorResponse,
  HealthResponseSchema,
  type HealthResponse as ApiHealth,
  ResumeListResponseSchema,
  ResumeDetailResponseSchema,
  ResumeResponseSchema,
  type ResumeDetail,
  type ResumeSummary,
} from '@job-ai-assistant/contracts';

export class ApiRequestError extends Error {
  readonly code: ApiErrorResponse['error']['code'];
  readonly status: number;
  readonly retryAfterSeconds: number | null;

  constructor(status: number, error: ApiErrorResponse['error'], retryAfterSeconds: number | null = null) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.code = error.code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '';
}

export async function getApiHealth(baseUrl: string): Promise<ApiHealth> {
  const response = await fetch(`${baseUrl}/health`, { credentials: 'include' });

  return parseResponse(response, HealthResponseSchema, 'API healthcheck returned an invalid response.');
}

export async function getCurrentUser(baseUrl: string): Promise<CurrentUser> {
  const response = await fetch(`${baseUrl}/users/me`, { credentials: 'include' });
  const payload = await parseUnknownResponse(response);

  if (!isCurrentUserResponse(payload)) {
    throw new Error('API returned an invalid current user response.');
  }

  return payload.user;
}

export async function signUpWithInvite(
  baseUrl: string,
  input: { name: string; email: string; password: string; inviteId: string },
): Promise<void> {
  await postAuth(baseUrl, '/sign-up/email', {
    ...input,
    callbackURL: getEmailVerificationCallbackUrl(),
  });
}

export async function signInWithPassword(
  baseUrl: string,
  input: { email: string; password: string },
): Promise<void> {
  await postAuth(baseUrl, '/sign-in/email', input);
}

export async function signOut(baseUrl: string): Promise<void> {
  await postAuth(baseUrl, '/sign-out', undefined);
}

export async function deleteCurrentUser(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/users/me`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmation: 'УДАЛИТЬ АККАУНТ' }),
  });

  await parseUnknownResponse(response);
}

export async function sendVerificationEmail(baseUrl: string, email: string): Promise<void> {
  await postAuth(baseUrl, '/send-verification-email', {
    email,
    callbackURL: getEmailVerificationCallbackUrl(),
  });
}

export async function requestPasswordReset(baseUrl: string, email: string): Promise<void> {
  await postAuth(baseUrl, '/request-password-reset', {
    email,
    redirectTo: getPasswordResetCallbackUrl(),
  });
}

export async function resetPassword(baseUrl: string, token: string, newPassword: string): Promise<void> {
  await postAuth(baseUrl, '/reset-password', { token, newPassword });
}

export async function getResumes(baseUrl: string): Promise<ResumeSummary[]> {
  const response = await fetch(`${baseUrl}/resumes`, { credentials: 'include' });

  const payload = await parseResponse(
    response,
    ResumeListResponseSchema,
    'API returned an invalid resume list response.',
  );

  return payload.resumes;
}

export async function createFileResume(
  baseUrl: string,
  input: { title: string; file: File },
): Promise<ResumeSummary> {
  const formData = new FormData();
  formData.set('title', input.title);
  formData.set('file', input.file);

  const response = await fetch(`${baseUrl}/resumes/file`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const payload = await parseResponse(
    response,
    ResumeResponseSchema,
    'API returned an invalid resume response.',
  );

  return payload.resume;
}

export async function getResume(baseUrl: string, resumeId: string): Promise<ResumeDetail> {
  const response = await fetch(`${baseUrl}/resumes/${encodeURIComponent(resumeId)}`, {
    credentials: 'include',
  });

  const payload = await parseResponse(
    response,
    ResumeDetailResponseSchema,
    'API returned an invalid resume preview response.',
  );

  return payload.resume;
}

export async function updateSanitizedResume(
  baseUrl: string,
  resumeId: string,
  sanitizedText: string,
): Promise<ResumeDetail> {
  const response = await fetch(
    `${baseUrl}/resumes/${encodeURIComponent(resumeId)}/sanitized-text`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sanitizedText }),
    },
  );

  const payload = await parseResponse(
    response,
    ResumeDetailResponseSchema,
    'API returned an invalid resume preview response.',
  );

  return payload.resume;
}

export async function confirmResume(baseUrl: string, resumeId: string): Promise<ResumeDetail> {
  const response = await fetch(`${baseUrl}/resumes/${encodeURIComponent(resumeId)}/confirm`, {
    method: 'POST',
    credentials: 'include',
  });

  const payload = await parseResponse(
    response,
    ResumeDetailResponseSchema,
    'API returned an invalid resume preview response.',
  );

  return payload.resume;
}

export async function deleteResume(baseUrl: string, resumeId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/resumes/${encodeURIComponent(resumeId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined);
    const parsedError = ApiErrorResponseSchema.safeParse(payload);

    if (parsedError.success) {
      throw new ApiRequestError(response.status, parsedError.data.error, getRetryAfterSeconds(response));
    }

    throw new ApiRequestError(response.status, {
      code: 'INTERNAL_ERROR',
      message: 'Сервис временно недоступен. Повторите попытку позже.',
    }, getRetryAfterSeconds(response));
  }
}

export async function createFileApplicationCase(
  baseUrl: string,
  input: { title: string; resumeId: string; file: File; replacementApplicationCaseId?: string },
): Promise<ApplicationCaseSummary> {
  const formData = new FormData();
  formData.set('title', input.title);
  formData.set('resumeId', input.resumeId);
  if (input.replacementApplicationCaseId !== undefined) formData.set('replacementApplicationCaseId', input.replacementApplicationCaseId);
  formData.set('file', input.file);

  const response = await fetch(`${baseUrl}/applications/file`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  const payload = await parseResponse(
    response,
    ApplicationCaseResponseSchema,
    'API returned an invalid vacancy response.',
  );

  return payload.applicationCase;
}

export async function getApplicationCaseAnalyses(baseUrl: string): Promise<ApplicationCaseAnalysisSummary[]> {
  const response = await fetch(`${baseUrl}/applications`, { credentials: 'include' });
  const payload = await parseResponse(
    response,
    ApplicationCaseAnalysisListResponseSchema,
    'API returned an invalid vacancy list response.',
  );

  return payload.applicationCases;
}

export async function updateApplicationCaseStage(baseUrl: string, applicationCaseId: string, status: ApplicationCaseAnalysisSummary['status']): Promise<void> {
  const response = await fetch(`${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}/stage`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new ApiRequestError(response.status, { code: 'INTERNAL_ERROR', message: 'Не удалось обновить статус вакансии.' });
}

export async function deleteCompletedApplicationCase(baseUrl: string, applicationCaseId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}`, { method: 'DELETE', credentials: 'include' });
  if (!response.ok) throw new ApiRequestError(response.status, { code: 'INTERNAL_ERROR', message: 'Не удалось удалить вакансию.' });
}

export async function launchInitialAnalysis(
  baseUrl: string,
  applicationCaseId: string,
): Promise<AnalysisRunSummary> {
  const response = await fetch(`${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}/analysis`, {
    method: 'POST',
    credentials: 'include',
  });

  const payload = await parseResponse(
    response,
    AnalysisRunResponseSchema,
    'API returned an invalid analysis run response.',
  );

  return payload.analysisRun;
}

export async function launchHrPreparation(
  baseUrl: string,
  applicationCaseId: string,
): Promise<AnalysisRunSummary> {
  const response = await fetch(`${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}/hr-preparation`, {
    method: 'POST',
    credentials: 'include',
  });

  const payload = await parseResponse(
    response,
    AnalysisRunResponseSchema,
    'API returned an invalid HR preparation run response.',
  );

  return payload.analysisRun;
}

export async function getInitialAnalysisStatus(
  baseUrl: string,
  applicationCaseId: string,
  analysisRunId: string,
): Promise<AnalysisRunSummary> {
  const response = await fetch(
    `${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}/analysis/${encodeURIComponent(analysisRunId)}`,
    { credentials: 'include' },
  );

  const payload = await parseResponse(
    response,
    AnalysisRunResponseSchema,
    'API returned an invalid analysis status response.',
  );

  return payload.analysisRun;
}

export async function getInitialAnalysisResult(
  baseUrl: string,
  applicationCaseId: string,
  analysisRunId: string,
): Promise<InitialAnalysisResult> {
  const response = await fetch(
    `${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}/analysis/${encodeURIComponent(analysisRunId)}/result`,
    { credentials: 'include' },
  );

  const payload = await parseResponse(
    response,
    InitialAnalysisResultResponseSchema,
    'API returned an invalid analysis result response.',
  );

  return payload.analysisResult;
}

export async function updateInitialAnalysisResult(
  baseUrl: string,
  applicationCaseId: string,
  analysisRunId: string,
  editedFinalMarkdown: string,
): Promise<InitialAnalysisResult> {
  const response = await fetch(
    `${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}/analysis/${encodeURIComponent(analysisRunId)}/result`,
    { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editedFinalMarkdown }) },
  );
  const payload = await parseResponse(response, InitialAnalysisResultResponseSchema, 'API returned an invalid analysis result response.');
  return payload.analysisResult;
}

export async function resetInitialAnalysisResult(
  baseUrl: string,
  applicationCaseId: string,
  analysisRunId: string,
): Promise<InitialAnalysisResult> {
  const response = await fetch(
    `${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}/analysis/${encodeURIComponent(analysisRunId)}/result/edited-markdown`,
    { method: 'DELETE', credentials: 'include' },
  );
  const payload = await parseResponse(response, InitialAnalysisResultResponseSchema, 'API returned an invalid analysis result response.');
  return payload.analysisResult;
}

export async function getArtifacts(baseUrl: string, applicationCaseId: string): Promise<ArtifactSummary[]> {
  const response = await fetch(
    `${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}/artifacts`,
    { credentials: 'include' },
  );
  const payload = await parseResponse(response, ArtifactListResponseSchema, 'API returned an invalid materials response.');

  return payload.artifacts;
}

export async function updateArtifact(
  baseUrl: string,
  applicationCaseId: string,
  artifactId: string,
  editedContent: string,
): Promise<ArtifactSummary> {
  const response = await fetch(
    `${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}/artifacts/${encodeURIComponent(artifactId)}`,
    {
      method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editedContent }),
    },
  );
  const payload = await parseResponse(response, ArtifactResponseSchema, 'API returned an invalid material response.');

  return payload.artifact;
}

export async function resetArtifactToGeneratedContent(
  baseUrl: string,
  applicationCaseId: string,
  artifactId: string,
): Promise<ArtifactSummary> {
  const response = await fetch(
    `${baseUrl}/applications/${encodeURIComponent(applicationCaseId)}/artifacts/${encodeURIComponent(artifactId)}/edited-content`,
    { method: 'DELETE', credentials: 'include' },
  );
  const payload = await parseResponse(response, ArtifactResponseSchema, 'API returned an invalid material response.');

  return payload.artifact;
}

async function parseResponse<T>(
  response: Response,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  invalidPayloadMessage: string,
): Promise<T> {

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined);
    const parsedError = ApiErrorResponseSchema.safeParse(payload);

    if (parsedError.success) {
      throw new ApiRequestError(response.status, parsedError.data.error);
    }

    throw new ApiRequestError(response.status, {
      code: 'INTERNAL_ERROR',
      message: 'Сервис временно недоступен. Повторите попытку позже.',
    });
  }

  const payload: unknown = await response.json();

  const parsedPayload = schema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error(invalidPayloadMessage);
  }

  return parsedPayload.data;
}

async function postAuth(baseUrl: string, path: string, body: unknown): Promise<void> {
  const response = await fetch(`${baseUrl}/api/auth${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  await parseUnknownResponse(response);
}

async function parseUnknownResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => undefined);
    const parsedPublicError = ApiErrorResponseSchema.safeParse(payload);

    if (parsedPublicError.success) {
      throw new ApiRequestError(response.status, parsedPublicError.data.error, getRetryAfterSeconds(response));
    }

    const message = getBetterAuthErrorMessage(payload);
    throw new ApiRequestError(response.status, {
      code: 'INTERNAL_ERROR',
      message: message ?? 'Не удалось выполнить действие. Повторите попытку позже.',
    }, getRetryAfterSeconds(response));
  }

  return response.json().catch(() => undefined);
}

function getBetterAuthErrorMessage(payload: unknown): string | undefined {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'message' in payload &&
    typeof payload.message === 'string' &&
    payload.message.length > 0
  ) {
    return payload.message;
  }

  return undefined;
}

function getRetryAfterSeconds(response: Response): number | null {
  const value = response.headers.get('x-retry-after');
  if (value === null) return null;

  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
}

function isCurrentUserResponse(value: unknown): value is { user: CurrentUser } {
  if (typeof value !== 'object' || value === null || !('user' in value)) {
    return false;
  }

  const { user } = value;
  if (typeof user !== 'object' || user === null) {
    return false;
  }

  const candidate = user as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.emailVerified === 'boolean'
  );
}

function getEmailVerificationCallbackUrl(): string {
  return `${window.location.origin}/?auth=verified`;
}

function getPasswordResetCallbackUrl(): string {
  return `${window.location.origin}/?auth=reset-password`;
}
