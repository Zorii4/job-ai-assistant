import assert from 'node:assert/strict';
import test from 'node:test';

import { API_SCHEMA_VERSION } from '@job-ai-assistant/contracts';

import {
  ApiRequestError,
  createTextResume,
  getApiHealth,
  getCurrentUser,
  getResumes,
  requestPasswordReset,
  signInWithPassword,
  signOut,
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

test('reads the current user only from the server session endpoint', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://api.test/users/me');
    assert.equal(init?.credentials, 'include');
    return Response.json({
      user: { id: 'user_1', name: 'Ирина', email: 'user@example.test', emailVerified: true },
      usage: { planCode: 'ALPHA' },
    });
  };

  const user = await getCurrentUser('http://api.test');
  assert.equal(user.emailVerified, true);
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

test('signs in through the Better Auth endpoint with cookies enabled', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://api.test/api/auth/sign-in/email');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'include');
    assert.deepEqual(init?.headers, { 'Content-Type': 'application/json' });
    assert.equal(init?.body, JSON.stringify({ email: 'user@example.test', password: 'password-123' }));
    return Response.json({ token: 'server-cookie-is-authoritative' });
  };

  await assert.doesNotReject(() =>
    signInWithPassword('http://api.test', { email: 'user@example.test', password: 'password-123' }),
  );
});

test('requests password recovery without exposing whether the account exists', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  t.after(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  });
  Object.defineProperty(globalThis, 'window', {
    value: { location: { origin: 'http://web.test' } },
    configurable: true,
  });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://api.test/api/auth/request-password-reset');
    assert.equal(init?.body, JSON.stringify({
      email: 'user@example.test',
      redirectTo: 'http://web.test/?auth=reset-password',
    }));
    return Response.json({ status: true, message: 'Check your email' });
  };

  await assert.doesNotReject(() => requestPasswordReset('http://api.test', 'user@example.test'));
});

test('signs out through the Better Auth endpoint', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://api.test/api/auth/sign-out');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'include');
    return Response.json({ success: true });
  };

  await assert.doesNotReject(() => signOut('http://api.test'));
});
