import assert from 'node:assert/strict';
import test from 'node:test';

import { API_SCHEMA_VERSION } from '@job-ai-assistant/contracts';

import { ApiRequestError, getApiHealth } from '../src/api.js';

test('accepts a valid API healthcheck response', async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    Response.json({ schemaVersion: API_SCHEMA_VERSION, status: 'ok' });

  await assert.doesNotReject(() => getApiHealth('http://api.test'));
});

test('uses the public API error response', async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    Response.json(
      {
        schemaVersion: API_SCHEMA_VERSION,
        error: {
          code: 'NOT_FOUND',
          message: 'Ресурс не найден.',
        },
      },
      { status: 404 },
    );

  await assert.rejects(
    () => getApiHealth('http://api.test'),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.status === 404 &&
      error.code === 'NOT_FOUND' &&
      error.message === 'Ресурс не найден.',
  );
});

test('rejects an invalid API healthcheck payload', async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    Response.json({ schemaVersion: API_SCHEMA_VERSION, status: 'unavailable' });

  await assert.rejects(() => getApiHealth('http://api.test'));
});
