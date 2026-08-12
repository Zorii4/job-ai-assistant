import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPasswordResetEmail,
  createVerificationEmail,
  dispatchAuthenticationEmail,
} from '../src/auth/auth-email.js';

test('verification email keeps the verification URL intact in text and escapes it in HTML', () => {
  const email = createVerificationEmail({
    to: 'person@example.test',
    url: 'https://api.example.test/verify-email?token=a&callbackURL=https://web.example.test',
  });

  assert.equal(email.to, 'person@example.test');
  assert.match(email.text, /token=a&callbackURL/);
  assert.match(email.html, /token=a&amp;callbackURL/);
  assert.match(email.html, /Подтвердить email/);
});

test('password reset email has a dedicated subject and action', () => {
  const email = createPasswordResetEmail({
    to: 'person@example.test',
    url: 'https://api.example.test/reset-password/token',
  });

  assert.match(email.subject, /Восстановление доступа/);
  assert.match(email.html, /Задать новый пароль/);
});

test('does not hide an authentication-email delivery failure', async () => {
  await assert.rejects(
    dispatchAuthenticationEmail({ async send() { throw new Error('provider rejected'); } }, {
      to: 'person@example.test', subject: 'Subject', text: 'Text', html: '<p>Text</p>',
    }),
    /Authentication email delivery failed/,
  );
});
