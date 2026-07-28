import assert from 'node:assert/strict';
import test from 'node:test';

import { API_SCHEMA_VERSION } from '@job-ai-assistant/contracts';

import {
  ApiRequestError,
  createTextResume,
  getApiHealth,
  getResumes,
} from '../src/api.js';

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

test('loads the authenticated resume library', async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://api.test/resumes');
    assert.equal(init?.credentials, 'include');

    return Response.json({
      schemaVersion: API_SCHEMA_VERSION,
      resumes: [
        {
          id: 'resume_1',
          title: 'Product Manager',
          sourceType: 'TEXT',
          sanitizationStatus: 'PENDING_REVIEW',
          confirmedAt: null,
          createdAt: '2026-07-28T12:00:00.000Z',
          updatedAt: '2026-07-28T12:00:00.000Z',
        },
      ],
    });
  };

  const resumes = await getResumes('http://api.test');

  assert.equal(resumes.length, 1);
  assert.equal(resumes[0]?.title, 'Product Manager');
});

test('creates a text resume through an authenticated request', async (t) => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://api.test/resumes');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'include');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
    assert.equal(init?.body, JSON.stringify({ title: 'Product Manager', sourceText: 'Опыт' }));

    return Response.json({
      schemaVersion: API_SCHEMA_VERSION,
      resume: {
        id: 'resume_1',
        title: 'Product Manager',
        sourceType: 'TEXT',
        sanitizationStatus: 'PENDING_REVIEW',
        confirmedAt: null,
        createdAt: '2026-07-28T12:00:00.000Z',
        updatedAt: '2026-07-28T12:00:00.000Z',
      },
    });
  };

  const resume = await createTextResume('http://api.test', {
    title: 'Product Manager',
    sourceText: 'Опыт',
  });

  assert.equal(resume.id, 'resume_1');
});
