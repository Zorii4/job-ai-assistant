import assert from 'node:assert/strict';
import test from 'node:test';

import { API_SCHEMA_VERSION } from '@job-ai-assistant/contracts';

import {
  ApiRequestError,
  createTextApplicationCase,
  createTextResume,
  getArtifacts,
  getApplicationCaseAnalyses,
  getInitialAnalysisStatus,
  getInitialAnalysisResult,
  getApiHealth,
  getCurrentUser,
  deleteCurrentUser,
  getResumes,
  requestPasswordReset,
  signInWithPassword,
  signUpWithInvite,
  signOut,
  updateArtifact,
  resetArtifactToGeneratedContent,
  updateInitialAnalysisResult,
  resetInitialAnalysisResult,
  updateApplicationCaseStage,
  launchHrPreparation,
} from '../src/api.js';

test('deletes the current account only with the required confirmation phrase', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let url = '';
  let request: RequestInit | undefined;
  globalThis.fetch = async (input, init) => { url = String(input); request = init; return new Response(JSON.stringify({ deleted: true }), { status: 200 }); };
  await deleteCurrentUser('http://api.test');
  assert.equal(url, 'http://api.test/users/me');
  assert.equal(request?.method, 'DELETE');
  assert.equal(request?.body, JSON.stringify({ confirmation: 'УДАЛИТЬ АККАУНТ' }));
});

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
          sourceType: 'FILE',
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

test('reads the completed markdown result from the owner-only endpoint', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://api.test/applications/application_1/analysis/run_1/result');
    assert.equal(init?.credentials, 'include');
    return Response.json({
      schemaVersion: API_SCHEMA_VERSION,
      analysisResult: { id: 'run_1', applicationCaseId: 'application_1', finalMarkdown: '# Готово', editedFinalMarkdown: null },
    });
  };

  assert.equal((await getInitialAnalysisResult('http://api.test', 'application_1', 'run_1')).finalMarkdown, '# Готово');
});

test('loads server-owned vacancy snapshots with their analysis runs', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://api.test/applications');
    assert.equal(init?.credentials, 'include');
    return Response.json({
      schemaVersion: API_SCHEMA_VERSION,
      applicationCases: [{
        id: 'application_1',
        title: 'Backend developer',
        status: 'ANALYZING',
        currentStage: 'ANALYZING',
        createdAt: '2026-08-13T12:00:00.000Z',
        updatedAt: '2026-08-13T12:00:00.000Z',
        analysisRun: {
          id: 'run_1',
          applicationCaseId: 'application_1',
          workflowType: 'INITIAL_ANALYSIS',
          status: 'RUNNING',
          currentStage: 'producer',
          errorCode: null,
          createdAt: '2026-08-13T12:00:00.000Z',
          updatedAt: '2026-08-13T12:00:00.000Z',
        },
        hrPreparationRun: null,
        postInterviewRun: null,
      }],
    });
  };

  assert.equal((await getApplicationCaseAnalyses('http://api.test'))[0]?.analysisRun?.status, 'RUNNING');
});

test('launches HR preparation with session cookies', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://api.test/applications/application_1/hr-preparation');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.credentials, 'include');
    return Response.json({
      schemaVersion: API_SCHEMA_VERSION,
      analysisRun: {
        id: 'run_hr_1', applicationCaseId: 'application_1', workflowType: 'HR_PREPARATION', status: 'QUEUED',
        currentStage: null, errorCode: null, createdAt: '2026-08-20T12:00:00.000Z', updatedAt: '2026-08-20T12:00:00.000Z',
      },
    });
  };

  assert.equal((await launchHrPreparation('http://api.test', 'application_1')).workflowType, 'HR_PREPARATION');
});

test('updates a vacancy stage with session cookies', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'http://api.test/applications/application_1/stage');
    assert.equal(init?.method, 'PATCH');
    assert.equal(init?.credentials, 'include');
    assert.equal(init?.body, JSON.stringify({ status: 'APPLIED' }));
    return Response.json({ schemaVersion: API_SCHEMA_VERSION });
  };

  await updateApplicationCaseStage('http://api.test', 'application_1', 'APPLIED');
});

test('saves and resets the independently edited full report', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (input, init) => { requests.push({ input, init }); return Response.json({ schemaVersion: API_SCHEMA_VERSION, analysisResult: { id: 'run_1', applicationCaseId: 'application_1', finalMarkdown: '# AI', editedFinalMarkdown: init?.method === 'PATCH' ? '# Моё' : null } }); };
  assert.equal((await updateInitialAnalysisResult('http://api.test', 'application_1', 'run_1', '# Моё')).editedFinalMarkdown, '# Моё');
  assert.equal((await resetInitialAnalysisResult('http://api.test', 'application_1', 'run_1')).editedFinalMarkdown, null);
  assert.equal(requests[0]?.init?.method, 'PATCH');
  assert.equal(requests[0]?.init?.body, JSON.stringify({ editedFinalMarkdown: '# Моё' }));
  assert.equal(requests[1]?.init?.method, 'DELETE');
});

test('reads, saves and resets an analysis material with session cookies', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ input: RequestInfo | URL; init: RequestInit | undefined }> = [];
  t.after(() => { globalThis.fetch = originalFetch; });

  const artifact = {
    id: 'artifact_1', applicationCaseId: 'application_1', type: 'COVER_LETTER', generatedContent: 'AI version', editedContent: null,
    updatedAt: '2026-08-03T18:00:00.000Z',
  };
  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });
    if (requests.length === 1) return Response.json({ schemaVersion: API_SCHEMA_VERSION, artifacts: [artifact] });
    return Response.json({ schemaVersion: API_SCHEMA_VERSION, artifact: { ...artifact, editedContent: requests.length === 2 ? 'Edited version' : null } });
  };

  assert.equal((await getArtifacts('http://api.test', 'application_1'))[0]?.id, 'artifact_1');
  assert.equal((await updateArtifact('http://api.test', 'application_1', 'artifact_1', 'Edited version')).editedContent, 'Edited version');
  assert.equal((await resetArtifactToGeneratedContent('http://api.test', 'application_1', 'artifact_1')).editedContent, null);
  assert.equal(requests[1]?.init?.method, 'PATCH');
  assert.equal(requests[1]?.init?.body, JSON.stringify({ editedContent: 'Edited version' }));
  assert.equal(requests[2]?.init?.method, 'DELETE');
  assert.equal(requests.every((request) => request.init?.credentials === 'include'), true);
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

test('exposes Better Auth rate-limit retry time to the registration UI', async (t) => {
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

  globalThis.fetch = async () => new Response(
    JSON.stringify({ message: 'Too many requests. Please try again later.' }),
    { status: 429, headers: { 'X-Retry-After': '137' } },
  );

  await assert.rejects(
    () => signUpWithInvite('http://api.test', { name: 'Ирина', email: 'user@example.test', password: 'password-123', inviteId: 'invite' }),
    (error: unknown) => error instanceof ApiRequestError && error.status === 429 && error.retryAfterSeconds === 137,
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
