import assert from 'node:assert/strict';
import test from 'node:test';

import { ResendEmailProvider } from '../src/email/resend-email.provider.js';

test('ResendEmailProvider sends only the supplied transactional message', async () => {
  let request: unknown;
  const provider = new ResendEmailProvider(
    {
      emails: {
        send: async (input) => {
          request = input;
          return { error: null };
        },
      },
    },
    'no-reply@auth.example.test',
  );

  await provider.send({
    to: 'person@example.test',
    subject: 'Subject',
    text: 'Text body',
    html: '<p>HTML body</p>',
  });

  assert.deepEqual(request, {
    from: 'no-reply@auth.example.test',
    to: ['person@example.test'],
    subject: 'Subject',
    text: 'Text body',
    html: '<p>HTML body</p>',
  });
});

test('ResendEmailProvider exposes no provider response when delivery is rejected', async () => {
  const provider = new ResendEmailProvider(
    {
      emails: {
        send: async () => ({ error: { name: 'validation_error' } }),
      },
    },
    'no-reply@auth.example.test',
  );

  await assert.rejects(
    provider.send({
      to: 'person@example.test',
      subject: 'Subject',
      text: 'Text body',
      html: '<p>HTML body</p>',
    }),
    /Resend rejected the transactional email/,
  );
});
