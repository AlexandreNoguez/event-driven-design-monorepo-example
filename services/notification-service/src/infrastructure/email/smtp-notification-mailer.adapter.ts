import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type {
  NotificationMailerPort,
  SendEmailInput,
  SendEmailResult,
} from '../../application/notification/ports/notification-mailer.port';

@Injectable()
export class SmtpNotificationMailerAdapter implements NotificationMailerPort {
  private readonly logger = new Logger(SmtpNotificationMailerAdapter.name);
  private transporter?: Transporter;

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const transporter = this.getTransporter();
    const from = process.env.MAIL_FROM ?? 'no-reply@event-pipeline.local';

    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      headers: input.headers,
    });

    this.logger.log(`SMTP mail sent to ${input.to} (messageId=${info.messageId ?? 'n/a'}).`);

    return {
      providerMessageId: typeof info.messageId === 'string' ? info.messageId : undefined,
    };
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = process.env.MAILHOG_SMTP_HOST ?? 'localhost';
    const port = parsePositiveInt(process.env.MAILHOG_SMTP_PORT, 1025);
    const secure = (process.env.NOTIFICATION_SMTP_SECURE ?? 'false').toLowerCase() === 'true';
    const user = (process.env.NOTIFICATION_SMTP_USER ?? '').trim();
    const pass = (process.env.NOTIFICATION_SMTP_PASSWORD ?? '').trim();

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    return this.transporter;
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
