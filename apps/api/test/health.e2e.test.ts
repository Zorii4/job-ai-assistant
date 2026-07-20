import assert from 'node:assert/strict';
import test from 'node:test';

import type { INestApplication } from '@nestjs/common';

import { API_SCHEMA_VERSION } from '@job-ai-assistant/contracts';

import { createApiApp } from '../src/main.js';

test('GET /health returns the API health status', async (t) => {
  const app: INestApplication = await createApiApp();
  await app.listen(0, '127.0.0.1');

  t.after(async () => {
    await app.close();
  });

  const address = app.getHttpServer().address();

  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');

  const response = await fetch(`http://127.0.0.1:${address.port}/health`, {
    headers: {
      Origin: 'http://localhost:5173',
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.deepEqual(await response.json(), {
    schemaVersion: API_SCHEMA_VERSION,
    status: 'ok',
  });
});

test('unknown API routes return the public error format', async (t) => {
  const app: INestApplication = await createApiApp();
  await app.listen(0, '127.0.0.1');

  t.after(async () => {
    await app.close();
  });

  const address = app.getHttpServer().address();

  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');

  const response = await fetch(`http://127.0.0.1:${address.port}/unknown-route`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    schemaVersion: API_SCHEMA_VERSION,
    error: {
      code: 'NOT_FOUND',
      message: 'Ресурс не найден.',
    },
  });
});
