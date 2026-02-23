import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULTS = {
  port: 3002,
  rabbitmqUrl: 'amqp://event:event@localhost:5672',
  rabbitmqEventsExchange: 'domain.events',
  commandQueue: 'q.upload.commands',
  commandPrefetch: 10,
  outboxPollIntervalMs: 2000,
  outboxBatchSize: 50,
  minioUploadsBucket: 'uploads',
  objectKeyPrefix: 'raw',
} as const;

export const UPLOAD_SERVICE_ENV_FILE_PATHS = [
  '.env.local',
  '.env',
  '../../.env.local',
  '../../.env',
];

@Injectable()
export class UploadServiceConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return this.config.get<number>('UPLOAD_SERVICE_PORT', DEFAULTS.port);
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

  get commandQueue(): string {
    return this.config.get<string>('UPLOAD_SERVICE_COMMAND_QUEUE', DEFAULTS.commandQueue);
  }

  get commandPrefetch(): number {
    return this.config.get<number>('UPLOAD_SERVICE_COMMAND_PREFETCH', DEFAULTS.commandPrefetch);
  }

  get outboxPollIntervalMs(): number {
    return this.config.get<number>(
      'UPLOAD_SERVICE_OUTBOX_POLL_INTERVAL_MS',
      DEFAULTS.outboxPollIntervalMs,
    );
  }

  get outboxBatchSize(): number {
    return this.config.get<number>('UPLOAD_SERVICE_OUTBOX_BATCH_SIZE', DEFAULTS.outboxBatchSize);
  }

  get minioUploadsBucket(): string {
    return this.config.get<string>('MINIO_BUCKET_UPLOADS', DEFAULTS.minioUploadsBucket);
  }

  get uploadObjectKeyPrefix(): string {
    return this.config.get<string>('UPLOAD_SERVICE_OBJECT_KEY_PREFIX', DEFAULTS.objectKeyPrefix);
  }
}

export function validateUploadServiceEnvironment(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const env = { ...raw };

  env.UPLOAD_SERVICE_PORT = toPositiveInt(raw.UPLOAD_SERVICE_PORT, DEFAULTS.port, 'UPLOAD_SERVICE_PORT');
  env.DATABASE_URL = requiredString(raw.DATABASE_URL, 'DATABASE_URL');
  env.RABBITMQ_URL = optionalString(raw.RABBITMQ_URL) ?? DEFAULTS.rabbitmqUrl;
  env.RABBITMQ_EXCHANGE_EVENTS =
    optionalString(raw.RABBITMQ_EXCHANGE_EVENTS) ?? DEFAULTS.rabbitmqEventsExchange;
  env.UPLOAD_SERVICE_COMMAND_QUEUE =
    optionalString(raw.UPLOAD_SERVICE_COMMAND_QUEUE) ?? DEFAULTS.commandQueue;
  env.UPLOAD_SERVICE_COMMAND_PREFETCH = toPositiveInt(
    raw.UPLOAD_SERVICE_COMMAND_PREFETCH,
    DEFAULTS.commandPrefetch,
    'UPLOAD_SERVICE_COMMAND_PREFETCH',
  );
  env.UPLOAD_SERVICE_OUTBOX_POLL_INTERVAL_MS = toPositiveInt(
    raw.UPLOAD_SERVICE_OUTBOX_POLL_INTERVAL_MS,
    DEFAULTS.outboxPollIntervalMs,
    'UPLOAD_SERVICE_OUTBOX_POLL_INTERVAL_MS',
  );
  env.UPLOAD_SERVICE_OUTBOX_BATCH_SIZE = toPositiveInt(
    raw.UPLOAD_SERVICE_OUTBOX_BATCH_SIZE,
    DEFAULTS.outboxBatchSize,
    'UPLOAD_SERVICE_OUTBOX_BATCH_SIZE',
  );
  env.MINIO_BUCKET_UPLOADS = optionalString(raw.MINIO_BUCKET_UPLOADS) ?? DEFAULTS.minioUploadsBucket;
  env.UPLOAD_SERVICE_OBJECT_KEY_PREFIX =
    optionalString(raw.UPLOAD_SERVICE_OBJECT_KEY_PREFIX) ?? DEFAULTS.objectKeyPrefix;

  return env;
}

function requiredString(value: unknown, name: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new Error(`[upload-service] ${name} is required.`);
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

  const parsed =
    typeof value === 'number' ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[upload-service] ${name} must be a positive integer.`);
  }

  return Math.trunc(parsed);
}
