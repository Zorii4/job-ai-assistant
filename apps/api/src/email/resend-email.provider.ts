import type { EmailMessage, EmailProvider } from './email-provider.js';

type ResendClient = {
  emails: {
    send(input: {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    }): Promise<{ error: unknown | null | undefined }>;
  };
};

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly resend: ResendClient,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    if (error !== null && error !== undefined) {
      throw new Error('Resend rejected the transactional email.');
    }
  }
}
