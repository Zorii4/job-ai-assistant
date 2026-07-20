import assert from 'node:assert/strict';
import test from 'node:test';

import type { INestApplication } from '@nestjs/common';

import { API_SCHEMA_VERSION } from '@job-ai-assistant/contracts';

import { createApiApp } from '../src/main.js';

test('GET /users/me rejects a request without a server session', async (t) => {
  const app: INestApplication = await createApiApp();
  await app.listen(0, '127.0.0.1');

  t.after(async () => {
    await app.close();
  });

  const address = app.getHttpServer().address();

  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');

  const response = await fetch(`http://127.0.0.1:${address.port}/users/me`);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    schemaVersion: API_SCHEMA_VERSION,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Требуется авторизация.',
    },
  });
});
