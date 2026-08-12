import type { EmailMessage, EmailProvider } from '../email/email-provider.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createLinkEmail(input: {
  subject: string;
  text: string;
  action: string;
  url: string;
  to: string;
}): EmailMessage {
  const safeUrl = escapeHtml(input.url);

  return {
    to: input.to,
    subject: input.subject,
    text: `${input.text}\n\n${input.action}: ${input.url}`,
    html: `<p>${escapeHtml(input.text)}</p><p><a href="${safeUrl}">${escapeHtml(input.action)}</a></p><p>Если вы не запрашивали это действие, просто проигнорируйте письмо.</p>`,
  };
}

export function createVerificationEmail(input: {
  to: string;
  url: string;
}): EmailMessage {
  return createLinkEmail({
    to: input.to,
    url: input.url,
    subject: 'Подтвердите email для Job AI Assistant',
    text: 'Чтобы завершить регистрацию, подтвердите этот email-адрес.',
    action: 'Подтвердить email',
  });
}

export function createPasswordResetEmail(input: {
  to: string;
  url: string;
}): EmailMessage {
  return createLinkEmail({
    to: input.to,
    url: input.url,
    subject: 'Восстановление доступа к Job AI Assistant',
    text: 'Чтобы задать новый пароль, перейдите по ссылке.',
    action: 'Задать новый пароль',
  });
}

export async function dispatchAuthenticationEmail(
  provider: EmailProvider,
  message: EmailMessage,
): Promise<void> {
  try {
    await provider.send(message);
  } catch {
    console.error('AUTH_EMAIL_DELIVERY_FAILED');
    throw new Error('Authentication email delivery failed.');
  }
}
