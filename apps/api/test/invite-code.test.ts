import assert from 'node:assert/strict';
import test from 'node:test';

import { createInviteCode, hashInviteCode } from '../src/auth/invite-code.js';

test('invite code is URL-safe and its stored value is keyed by the auth secret', () => {
  const code = createInviteCode();
  const firstHash = hashInviteCode(code, 'test-secret-that-is-long-enough-for-better-auth');

  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(firstHash, hashInviteCode(code, 'test-secret-that-is-long-enough-for-better-auth'));
  assert.notEqual(firstHash, hashInviteCode(code, 'another-test-secret-that-is-long-enough'));
  assert.notEqual(firstHash, code);
});
