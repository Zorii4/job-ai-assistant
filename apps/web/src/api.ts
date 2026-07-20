import {
  ApiErrorResponseSchema,
  type ApiErrorResponse,
  HealthResponseSchema,
  type HealthResponse as ApiHealth,
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
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
}

export async function getApiHealth(baseUrl: string): Promise<ApiHealth> {
  const response = await fetch(`${baseUrl}/health`);

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

  const parsedPayload = HealthResponseSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw new Error('API healthcheck returned an invalid response.');
  }

  return parsedPayload.data;
}
