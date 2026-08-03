import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  API_SCHEMA_VERSION,
  ApiErrorResponseSchema,
  type ApiErrorResponse,
} from '@job-ai-assistant/contracts';
import { AnalysisQuotaExceededException } from '../applications/analysis-quota-exceeded.exception.js';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json(createErrorResponse(status, exception));
  }
}

function createErrorResponse(status: number, exception: unknown): ApiErrorResponse {
  const error =
    status === HttpStatus.BAD_REQUEST
      ? { code: 'BAD_REQUEST' as const, message: 'Некорректный запрос.' }
      : status === HttpStatus.PAYLOAD_TOO_LARGE
        ? {
            code: 'PAYLOAD_TOO_LARGE' as const,
            message: 'Размер файла превышает допустимый лимит.',
          }
        : status === HttpStatus.TOO_MANY_REQUESTS
          ? {
              code: exception instanceof AnalysisQuotaExceededException
                ? 'ANALYSIS_QUOTA_EXCEEDED' as const
                : 'RESUME_LIMIT_REACHED' as const,
              message: exception instanceof AnalysisQuotaExceededException
                ? 'Лимит из десяти анализов исчерпан.'
                : 'Можно сохранить не более пяти резюме.',
            }
      : status === HttpStatus.UNAUTHORIZED
        ? {
            code: 'UNAUTHORIZED' as const,
            message: 'Требуется авторизация.',
          }
      : status === HttpStatus.NOT_FOUND
        ? { code: 'NOT_FOUND' as const, message: 'Ресурс не найден.' }
        : {
            code: 'INTERNAL_ERROR' as const,
            message: 'Внутренняя ошибка сервиса. Повторите попытку позже.',
          };

  return ApiErrorResponseSchema.parse({
    schemaVersion: API_SCHEMA_VERSION,
    error,
  });
}
