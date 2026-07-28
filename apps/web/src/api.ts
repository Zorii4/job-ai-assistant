import {
  ApiErrorResponseSchema,
  type ApiErrorResponse,
  HealthResponseSchema,
  type HealthResponse as ApiHealth,
  ResumeListResponseSchema,
  ResumeDetailResponseSchema,
  ResumeResponseSchema,
  type CreateResumeRequest,
  type ResumeDetail,
  type ResumeSummary,
} from '@job-ai-assistant/contracts';

export class ApiRequestError extends Error {
  readonly code: ApiErrorResponse['error']['code'];
  readonly status: number;

  constructor(status: number, error: ApiErrorResponse['error']) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.code = error.code;
    this.status = status;
  }
}

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '';
}

export async function getApiHealth(baseUrl: string): Promise<ApiHealth> {
  const response = await fetch(`${baseUrl}/health`, { credentials: 'include' });

  return parseResponse(response, HealthResponseSchema, 'API healthcheck returned an invalid response.');
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

export async function createTextResume(
  baseUrl: string,
  input: CreateResumeRequest,
): Promise<ResumeSummary> {
  const response = await fetch(`${baseUrl}/resumes`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const payload = await parseResponse(
    response,
    ResumeResponseSchema,
    'API returned an invalid resume response.',
  );

  return payload.resume;
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
      throw new ApiRequestError(response.status, parsedError.data.error);
    }

    throw new ApiRequestError(response.status, {
      code: 'INTERNAL_ERROR',
      message: 'Сервис временно недоступен. Повторите попытку позже.',
    });
  }
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
