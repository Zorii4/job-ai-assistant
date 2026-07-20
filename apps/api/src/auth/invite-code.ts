import { createHmac, randomBytes } from 'node:crypto';

export function createInviteCode(): string {
  return randomBytes(32).toString('base64url');
}

export function hashInviteCode(code: string, secret: string): string {
  return createHmac('sha256', secret).update(code.trim()).digest('hex');
}
