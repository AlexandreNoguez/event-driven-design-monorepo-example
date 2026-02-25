import { Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import nodemailer, { type Transporter } from 'nodemailer';
import type {
  NotificationMailerPort,
  SendEmailInput,
  SendEmailResult,
} from '../../application/notification/ports/notification-mailer.port';
import { NotificationServiceConfigService } from '../config/notification-service-config.service';

@Injectable()
export class SmtpNotificationMailerAdapter implements NotificationMailerPort {
  private readonly logger = new Logger(SmtpNotificationMailerAdapter.name);
  private transporter?: Transporter;

  constructor(private readonly config: NotificationServiceConfigService) {}

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const transporter = this.getTransporter();
    const from = this.config.mailFrom;

    const info = await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      headers: input.headers,
    });

    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'notification-service',
      message: 'SMTP mail sent.',
      correlationId:
        typeof input.headers?.['X-Correlation-Id'] === 'string'
          ? input.headers['X-Correlation-Id']
          : 'system',
      metadata: {
        recipient: input.to,
        providerMessageId: info.messageId ?? null,
      },
    })));

    return {
      providerMessageId: typeof info.messageId === 'string' ? info.messageId : undefined,
    };
  }

  private getTransporter(): Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.config.smtpHost;
    const port = this.config.smtpPort;
    const secure = this.config.smtpSecure;
    const user = this.config.smtpUser.trim();
    const pass = this.config.smtpPassword.trim();

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    return this.transporter;
  }
}
