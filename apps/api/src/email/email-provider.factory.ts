import { Resend } from 'resend';

import type { EmailProvider } from './email-provider.js';
import { ResendEmailProvider } from './resend-email.provider.js';

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function createEmailProviderFromEnvironment(): EmailProvider {
  const apiKey = getRequiredEnvironmentVariable('RESEND_API_KEY');
  const from = getRequiredEnvironmentVariable('AUTH_EMAIL_FROM');

  return new ResendEmailProvider(new Resend(apiKey), from);
}
