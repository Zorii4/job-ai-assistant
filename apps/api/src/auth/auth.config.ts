import { betterAuth } from 'better-auth/minimal';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';

import { loadProjectEnvironmentWhenMissing } from '../config/load-project-env.js';
import { prisma } from '../database/prisma.service.js';
import { createEmailProviderFromEnvironment } from '../email/email-provider.factory.js';
import {
  createPasswordResetEmail,
  createVerificationEmail,
  dispatchAuthenticationEmail,
} from './auth-email.js';
import { hashInviteCode } from './invite-code.js';

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

loadProjectEnvironmentWhenMissing('BETTER_AUTH_SECRET');

const secret = getRequiredEnvironmentVariable('BETTER_AUTH_SECRET');

if (secret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
}

const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const emailProvider = createEmailProviderFromEnvironment();
const clientIpHeader = process.env.AUTH_CLIENT_IP_HEADER ?? 'x-real-ip';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  baseURL: getRequiredEnvironmentVariable('BETTER_AUTH_URL'),
  secret,
  trustedOrigins: [webOrigin],
  advanced: {
    ipAddress: {
      ipAddressHeaders: [clientIpHeader],
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await dispatchAuthenticationEmail(
        emailProvider,
        createPasswordResetEmail({ to: user.email, url }),
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, url }) => {
      await dispatchAuthenticationEmail(
        emailProvider,
        createVerificationEmail({ to: user.email, url }),
      );
    },
  },
  rateLimit: {
    enabled: true,
    storage: 'database',
    modelName: 'rateLimit',
    window: 60,
    max: 20,
    customRules: {
      '/sign-up/email': { window: 600, max: 3 },
      '/sign-in/email': { window: 600, max: 5 },
      '/request-password-reset': { window: 600, max: 3 },
      '/send-verification-email': { window: 600, max: 3 },
    },
  },
  user: {
    additionalFields: {
      inviteId: {
        type: 'string',
        required: true,
        returned: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const inviteCode = user.inviteId;

          if (typeof inviteCode !== 'string' || inviteCode.length === 0) {
            throw APIError.from('FORBIDDEN', {
              code: 'INVITE_REQUIRED',
              message: 'Для регистрации требуется действующий инвайт.',
            });
          }

          const normalizedEmail = user.email.toLowerCase();
          const invitation = await prisma.invite.findFirst({
            where: {
              codeHash: hashInviteCode(inviteCode, secret),
              usedAt: null,
              expiresAt: { gt: new Date() },
              OR: [{ email: null }, { email: normalizedEmail }],
            },
          });

          if (invitation === null) {
            throw APIError.from('FORBIDDEN', {
              code: 'INVITE_INVALID',
              message: 'Для регистрации требуется действующий инвайт.',
            });
          }

          return {
            data: {
              ...user,
              inviteId: invitation.id,
            },
          };
        },
        after: async (user) => {
          const inviteId = user.inviteId;

          if (typeof inviteId !== 'string') {
            return;
          }

          await prisma.invite.updateMany({
            where: {
              id: inviteId,
              usedAt: null,
            },
            data: { usedAt: new Date() },
          });
        },
      },
    },
  },
});
