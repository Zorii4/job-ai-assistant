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
