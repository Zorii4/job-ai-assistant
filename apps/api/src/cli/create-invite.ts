import { loadProjectEnvironmentWhenMissing } from '../config/load-project-env.js';
import { prisma } from '../database/prisma.service.js';
import { createInviteCode, hashInviteCode } from '../auth/invite-code.js';

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseEmail(): string | undefined {
  const emailIndex = process.argv.indexOf('--email');

  if (emailIndex === -1) {
    return undefined;
  }

  const email = process.argv[emailIndex + 1];

  if (email === undefined || email.length === 0) {
    throw new Error('Expected an email after --email.');
  }

  return email.toLowerCase();
}

async function main(): Promise<void> {
  loadProjectEnvironmentWhenMissing('BETTER_AUTH_SECRET');

  const secret = getRequiredEnvironmentVariable('BETTER_AUTH_SECRET');
  const code = createInviteCode();
  const email = parseEmail();

  await prisma.invite.create({
    data: {
      id: crypto.randomUUID(),
      codeHash: hashInviteCode(code, secret),
      email,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(code);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
