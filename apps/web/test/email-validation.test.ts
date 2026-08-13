import assert from 'node:assert/strict';
import test from 'node:test';

import { isValidEmailAddress } from '../src/features/auth/emailValidation.js';

test('accepts a basic email address before an auth request', () => {
  assert.equal(isValidEmailAddress('user@example.test'), true);
});

test('rejects blank and malformed email addresses before an auth request', () => {
  assert.equal(isValidEmailAddress(''), false);
  assert.equal(isValidEmailAddress('not-an-email'), false);
  assert.equal(isValidEmailAddress('user@localhost'), false);
});
