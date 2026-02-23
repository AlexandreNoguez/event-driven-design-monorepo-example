export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  providerMessageId?: string;
}

export const NOTIFICATION_MAILER_PORT = Symbol('NOTIFICATION_MAILER_PORT');

export interface NotificationMailerPort {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
