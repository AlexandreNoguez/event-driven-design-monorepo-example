import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULTS = {
  port: 3003,
  databaseUrl: undefined,
  rabbitmqUrl: 'amqp://event:event@localhost:5672',
  rabbitmqEventsExchange: 'domain.events',
  queue: 'q.validator',
  prefetch: 10,
  consumerName: 'validator:file-uploaded',
  outboxPollIntervalMs: 2000,
  outboxBatchSize: 50,
  outboxMaxPublishAttempts: 5,
  maxSizeBytes: 20 * 1024 * 1024,
  allowedMimeTypes: 'image/png,image/jpeg,image/webp,application/pdf',
  signatureReadBytes: 64,
  minioEndpoint: 'localhost',
  minioApiPort: 9000,
  minioUseSsl: false,
  minioRootUser: 'minioadmin',
  minioRootPassword: 'minioadmin',
  s3Region: 'us-east-1',
} as const;

export const VALIDATOR_SERVICE_ENV_FILE_PATHS = [
  '.env.local',
  '.env',
  '../../.env.local',
  '../../.env',
];

@Injectable()
export class ValidatorServiceConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return this.config.get<number>('VALIDATOR_SERVICE_PORT', DEFAULTS.port);
  }

  get databaseUrl(): string {
    return this.config.getOrThrow<string>('DATABASE_URL');
  }

  get rabbitmqUrl(): string {
    return this.config.get<string>('RABBITMQ_URL', DEFAULTS.rabbitmqUrl);
  }

  get rabbitmqEventsExchange(): string {
    return this.config.get<string>('RABBITMQ_EXCHANGE_EVENTS', DEFAULTS.rabbitmqEventsExchange);
  }

  get queue(): string {
    return this.config.get<string>('VALIDATOR_SERVICE_QUEUE', DEFAULTS.queue);
  }

  get prefetch(): number {
    return this.config.get<number>('VALIDATOR_SERVICE_PREFETCH', DEFAULTS.prefetch);
  }

  get consumerName(): string {
    return this.config.get<string>('VALIDATOR_SERVICE_CONSUMER_NAME', DEFAULTS.consumerName);
  }

  get outboxPollIntervalMs(): number {
    return this.config.get<number>(
      'VALIDATOR_SERVICE_OUTBOX_POLL_INTERVAL_MS',
      DEFAULTS.outboxPollIntervalMs,
    );
  }

  get outboxBatchSize(): number {
    return this.config.get<number>(
      'VALIDATOR_SERVICE_OUTBOX_BATCH_SIZE',
      DEFAULTS.outboxBatchSize,
    );
  }

  get outboxMaxPublishAttempts(): number {
    return this.config.get<number>(
      'VALIDATOR_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS',
      DEFAULTS.outboxMaxPublishAttempts,
    );
  }

  get signatureReadBytes(): number {
    return this.config.get<number>('VALIDATOR_SERVICE_SIGNATURE_READ_BYTES', DEFAULTS.signatureReadBytes);
  }

  get maxSizeBytes(): number {
    return this.config.get<number>('VALIDATOR_SERVICE_MAX_SIZE_BYTES', DEFAULTS.maxSizeBytes);
  }

  get allowedMimeTypesCsv(): string {
    return this.config.get<string>(
      'VALIDATOR_SERVICE_ALLOWED_MIME_TYPES',
      DEFAULTS.allowedMimeTypes,
    );
  }

  get minioEndpoint(): string {
    return this.config.get<string>('MINIO_ENDPOINT', DEFAULTS.minioEndpoint);
  }

  get minioApiPort(): number {
    return this.config.get<number>('MINIO_API_PORT', DEFAULTS.minioApiPort);
  }

  get minioUseSsl(): boolean {
    return this.config.get<boolean>('MINIO_USE_SSL', DEFAULTS.minioUseSsl);
  }

  get minioRootUser(): string {
    return this.config.get<string>('MINIO_ROOT_USER', DEFAULTS.minioRootUser);
  }

  get minioRootPassword(): string {
    return this.config.get<string>('MINIO_ROOT_PASSWORD', DEFAULTS.minioRootPassword);
  }

  get s3Region(): string {
    return this.config.get<string>('S3_REGION', DEFAULTS.s3Region);
  }
}

export function validateValidatorServiceEnvironment(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const env = { ...raw };

  env.VALIDATOR_SERVICE_PORT = toPositiveInt(raw.VALIDATOR_SERVICE_PORT, DEFAULTS.port, 'VALIDATOR_SERVICE_PORT');
  env.DATABASE_URL = requiredString(raw.DATABASE_URL, 'DATABASE_URL');
  env.RABBITMQ_URL = optionalString(raw.RABBITMQ_URL) ?? DEFAULTS.rabbitmqUrl;
  env.RABBITMQ_EXCHANGE_EVENTS =
    optionalString(raw.RABBITMQ_EXCHANGE_EVENTS) ?? DEFAULTS.rabbitmqEventsExchange;
  env.VALIDATOR_SERVICE_QUEUE = optionalString(raw.VALIDATOR_SERVICE_QUEUE) ?? DEFAULTS.queue;
  env.VALIDATOR_SERVICE_PREFETCH = toPositiveInt(
    raw.VALIDATOR_SERVICE_PREFETCH,
    DEFAULTS.prefetch,
    'VALIDATOR_SERVICE_PREFETCH',
  );
  env.VALIDATOR_SERVICE_CONSUMER_NAME =
    optionalString(raw.VALIDATOR_SERVICE_CONSUMER_NAME) ?? DEFAULTS.consumerName;
  env.VALIDATOR_SERVICE_OUTBOX_POLL_INTERVAL_MS = toPositiveInt(
    raw.VALIDATOR_SERVICE_OUTBOX_POLL_INTERVAL_MS,
    DEFAULTS.outboxPollIntervalMs,
    'VALIDATOR_SERVICE_OUTBOX_POLL_INTERVAL_MS',
  );
  env.VALIDATOR_SERVICE_OUTBOX_BATCH_SIZE = toPositiveInt(
    raw.VALIDATOR_SERVICE_OUTBOX_BATCH_SIZE,
    DEFAULTS.outboxBatchSize,
    'VALIDATOR_SERVICE_OUTBOX_BATCH_SIZE',
  );
  env.VALIDATOR_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS = toPositiveInt(
    raw.VALIDATOR_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS,
    DEFAULTS.outboxMaxPublishAttempts,
    'VALIDATOR_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS',
  );
  env.VALIDATOR_SERVICE_SIGNATURE_READ_BYTES = toPositiveInt(
    raw.VALIDATOR_SERVICE_SIGNATURE_READ_BYTES,
    DEFAULTS.signatureReadBytes,
    'VALIDATOR_SERVICE_SIGNATURE_READ_BYTES',
  );
  env.VALIDATOR_SERVICE_MAX_SIZE_BYTES = toPositiveInt(
    raw.VALIDATOR_SERVICE_MAX_SIZE_BYTES,
    DEFAULTS.maxSizeBytes,
    'VALIDATOR_SERVICE_MAX_SIZE_BYTES',
  );
  env.VALIDATOR_SERVICE_ALLOWED_MIME_TYPES =
    optionalString(raw.VALIDATOR_SERVICE_ALLOWED_MIME_TYPES) ?? DEFAULTS.allowedMimeTypes;

  env.MINIO_ENDPOINT = optionalString(raw.MINIO_ENDPOINT) ?? DEFAULTS.minioEndpoint;
  env.MINIO_API_PORT = toPositiveInt(raw.MINIO_API_PORT, DEFAULTS.minioApiPort, 'MINIO_API_PORT');
  env.MINIO_USE_SSL = toBoolean(raw.MINIO_USE_SSL, DEFAULTS.minioUseSsl, 'MINIO_USE_SSL');
  env.MINIO_ROOT_USER = optionalString(raw.MINIO_ROOT_USER) ?? DEFAULTS.minioRootUser;
  env.MINIO_ROOT_PASSWORD = optionalString(raw.MINIO_ROOT_PASSWORD) ?? DEFAULTS.minioRootPassword;
  env.S3_REGION = optionalString(raw.S3_REGION) ?? DEFAULTS.s3Region;

  return env;
}

function requiredString(value: unknown, name: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new Error(`[validator-service] ${name} is required.`);
  }
  return normalized;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toPositiveInt(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[validator-service] ${name} must be a positive integer.`);
  }

  return Math.trunc(parsed);
}

function toBoolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }

  throw new Error(`[validator-service] ${name} must be "true" or "false".`);
}
