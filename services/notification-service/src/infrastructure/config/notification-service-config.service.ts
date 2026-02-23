import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULTS = {
  port: 3006,
  rabbitmqUrl: 'amqp://event:event@localhost:5672',
  queue: 'q.notification',
  prefetch: 10,
  consumerName: 'notification:events',
  defaultRecipientDomain: 'event-pipeline.local',
  fallbackRecipient: 'notifications@event-pipeline.local',
  mailFrom: 'no-reply@event-pipeline.local',
  smtpHost: 'localhost',
  smtpPort: 1025,
  smtpSecure: false,
  smtpUser: '',
  smtpPassword: '',
} as const;

export const NOTIFICATION_SERVICE_ENV_FILE_PATHS = [
  '.env.local',
  '.env',
  '../../.env.local',
  '../../.env',
];

@Injectable()
export class NotificationServiceConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return this.config.get<number>('NOTIFICATION_SERVICE_PORT', DEFAULTS.port);
  }
  get databaseUrl(): string {
    return this.config.getOrThrow<string>('DATABASE_URL');
  }
  get rabbitmqUrl(): string {
    return this.config.get<string>('RABBITMQ_URL', DEFAULTS.rabbitmqUrl);
  }
  get queue(): string {
    return this.config.get<string>('NOTIFICATION_SERVICE_QUEUE', DEFAULTS.queue);
  }
  get prefetch(): number {
    return this.config.get<number>('NOTIFICATION_SERVICE_PREFETCH', DEFAULTS.prefetch);
  }
  get consumerName(): string {
    return this.config.get<string>('NOTIFICATION_SERVICE_CONSUMER_NAME', DEFAULTS.consumerName);
  }
  get defaultRecipientDomain(): string {
    return this.config.get<string>(
      'NOTIFICATION_DEFAULT_RECIPIENT_DOMAIN',
      DEFAULTS.defaultRecipientDomain,
    );
  }
  get fallbackRecipient(): string {
    return this.config.get<string>('NOTIFICATION_FALLBACK_TO', DEFAULTS.fallbackRecipient);
  }
  get mailFrom(): string {
    return this.config.get<string>('MAIL_FROM', DEFAULTS.mailFrom);
  }
  get smtpHost(): string {
    return this.config.get<string>('MAILHOG_SMTP_HOST', DEFAULTS.smtpHost);
  }
  get smtpPort(): number {
    return this.config.get<number>('MAILHOG_SMTP_PORT', DEFAULTS.smtpPort);
  }
  get smtpSecure(): boolean {
    return this.config.get<boolean>('NOTIFICATION_SMTP_SECURE', DEFAULTS.smtpSecure);
  }
  get smtpUser(): string {
    return this.config.get<string>('NOTIFICATION_SMTP_USER', DEFAULTS.smtpUser);
  }
  get smtpPassword(): string {
    return this.config.get<string>('NOTIFICATION_SMTP_PASSWORD', DEFAULTS.smtpPassword);
  }
}

export function validateNotificationServiceEnvironment(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const env = { ...raw };
  env.NOTIFICATION_SERVICE_PORT = toPositiveInt(raw.NOTIFICATION_SERVICE_PORT, DEFAULTS.port, 'NOTIFICATION_SERVICE_PORT');
  env.DATABASE_URL = requiredString(raw.DATABASE_URL, 'DATABASE_URL');
  env.RABBITMQ_URL = optionalString(raw.RABBITMQ_URL) ?? DEFAULTS.rabbitmqUrl;
  env.NOTIFICATION_SERVICE_QUEUE = optionalString(raw.NOTIFICATION_SERVICE_QUEUE) ?? DEFAULTS.queue;
  env.NOTIFICATION_SERVICE_PREFETCH = toPositiveInt(
    raw.NOTIFICATION_SERVICE_PREFETCH,
    DEFAULTS.prefetch,
    'NOTIFICATION_SERVICE_PREFETCH',
  );
  env.NOTIFICATION_SERVICE_CONSUMER_NAME =
    optionalString(raw.NOTIFICATION_SERVICE_CONSUMER_NAME) ?? DEFAULTS.consumerName;
  env.NOTIFICATION_DEFAULT_RECIPIENT_DOMAIN =
    optionalString(raw.NOTIFICATION_DEFAULT_RECIPIENT_DOMAIN) ?? DEFAULTS.defaultRecipientDomain;
  env.NOTIFICATION_FALLBACK_TO = optionalString(raw.NOTIFICATION_FALLBACK_TO) ?? DEFAULTS.fallbackRecipient;
  env.MAIL_FROM = optionalString(raw.MAIL_FROM) ?? DEFAULTS.mailFrom;
  env.MAILHOG_SMTP_HOST = optionalString(raw.MAILHOG_SMTP_HOST) ?? DEFAULTS.smtpHost;
  env.MAILHOG_SMTP_PORT = toPositiveInt(raw.MAILHOG_SMTP_PORT, DEFAULTS.smtpPort, 'MAILHOG_SMTP_PORT');
  env.NOTIFICATION_SMTP_SECURE = toBoolean(raw.NOTIFICATION_SMTP_SECURE, DEFAULTS.smtpSecure, 'NOTIFICATION_SMTP_SECURE');
  env.NOTIFICATION_SMTP_USER = optionalString(raw.NOTIFICATION_SMTP_USER) ?? DEFAULTS.smtpUser;
  env.NOTIFICATION_SMTP_PASSWORD = optionalString(raw.NOTIFICATION_SMTP_PASSWORD) ?? DEFAULTS.smtpPassword;
  return env;
}

function requiredString(value: unknown, name: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(`[notification-service] ${name} is required.`);
  return normalized;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toPositiveInt(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[notification-service] ${name} must be a positive integer.`);
  }
  return Math.trunc(parsed);
}

function toBoolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`[notification-service] ${name} must be "true" or "false".`);
}
