import assert from 'node:assert/strict';
import test from 'node:test';

import {
  API_SCHEMA_VERSION,
  ApiErrorResponseSchema,
  HealthResponseSchema,
} from '../src/index.js';

test('HealthResponseSchema accepts the health response', () => {
  assert.deepEqual(
    HealthResponseSchema.parse({ schemaVersion: API_SCHEMA_VERSION, status: 'ok' }),
    { schemaVersion: API_SCHEMA_VERSION, status: 'ok' },
  );
});

test('HealthResponseSchema rejects malformed health responses', () => {
  assert.throws(() =>
    HealthResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      status: 'unavailable',
    }),
  );
  assert.throws(() =>
    HealthResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      status: 'ok',
      extra: true,
    }),
  );
});

test('ApiErrorResponseSchema accepts only the public error fields', () => {
  assert.deepEqual(
    ApiErrorResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      error: {
        code: 'NOT_FOUND',
        message: 'Ресурс не найден.',
      },
    }),
    {
      schemaVersion: API_SCHEMA_VERSION,
      error: {
        code: 'NOT_FOUND',
        message: 'Ресурс не найден.',
      },
    },
  );

  assert.throws(() =>
    ApiErrorResponseSchema.parse({
      schemaVersion: API_SCHEMA_VERSION,
      error: {
        code: 'NOT_FOUND',
        message: 'Ресурс не найден.',
        stack: 'internal details',
      },
    }),
  );
});
