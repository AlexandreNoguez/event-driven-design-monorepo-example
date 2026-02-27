import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULTS = {
  port: 3005,
  rabbitmqUrl: 'amqp://event:event@localhost:5672',
  rabbitmqEventsExchange: 'domain.events',
  queue: 'q.extractor',
  prefetch: 10,
  consumerName: 'extractor:file-validated',
  outboxPollIntervalMs: 2000,
  outboxBatchSize: 50,
  outboxMaxPublishAttempts: 5,
  includeSha256: true,
  imageMetadataMimeTypes: 'image/png,image/jpeg,image/webp,image/gif',
  minioEndpoint: 'localhost',
  minioApiPort: 9000,
  minioUseSsl: false,
  minioRootUser: 'minioadmin',
  minioRootPassword: 'minioadmin',
  s3Region: 'us-east-1',
} as const;

export const EXTRACTOR_SERVICE_ENV_FILE_PATHS = [
  '.env.local',
  '.env',
  '../../.env.local',
  '../../.env',
];

@Injectable()
export class ExtractorServiceConfigService {
  constructor(private readonly config: ConfigService) {}
  get port(): number { return this.config.get<number>('EXTRACTOR_SERVICE_PORT', DEFAULTS.port); }
  get databaseUrl(): string { return this.config.getOrThrow<string>('DATABASE_URL'); }
  get rabbitmqUrl(): string { return this.config.get<string>('RABBITMQ_URL', DEFAULTS.rabbitmqUrl); }
  get rabbitmqEventsExchange(): string {
    return this.config.get<string>('RABBITMQ_EXCHANGE_EVENTS', DEFAULTS.rabbitmqEventsExchange);
  }
  get queue(): string { return this.config.get<string>('EXTRACTOR_SERVICE_QUEUE', DEFAULTS.queue); }
  get prefetch(): number { return this.config.get<number>('EXTRACTOR_SERVICE_PREFETCH', DEFAULTS.prefetch); }
  get consumerName(): string {
    return this.config.get<string>('EXTRACTOR_SERVICE_CONSUMER_NAME', DEFAULTS.consumerName);
  }
  get outboxPollIntervalMs(): number {
    return this.config.get<number>(
      'EXTRACTOR_SERVICE_OUTBOX_POLL_INTERVAL_MS',
      DEFAULTS.outboxPollIntervalMs,
    );
  }
  get outboxBatchSize(): number {
    return this.config.get<number>(
      'EXTRACTOR_SERVICE_OUTBOX_BATCH_SIZE',
      DEFAULTS.outboxBatchSize,
    );
  }
  get outboxMaxPublishAttempts(): number {
    return this.config.get<number>(
      'EXTRACTOR_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS',
      DEFAULTS.outboxMaxPublishAttempts,
    );
  }
  get includeSha256(): boolean {
    return this.config.get<boolean>('EXTRACTOR_SERVICE_INCLUDE_SHA256', DEFAULTS.includeSha256);
  }
  get imageMetadataMimeTypesCsv(): string {
    return this.config.get<string>(
      'EXTRACTOR_SERVICE_IMAGE_METADATA_MIME_TYPES',
      DEFAULTS.imageMetadataMimeTypes,
    );
  }
  get minioEndpoint(): string { return this.config.get<string>('MINIO_ENDPOINT', DEFAULTS.minioEndpoint); }
  get minioApiPort(): number { return this.config.get<number>('MINIO_API_PORT', DEFAULTS.minioApiPort); }
  get minioUseSsl(): boolean { return this.config.get<boolean>('MINIO_USE_SSL', DEFAULTS.minioUseSsl); }
  get minioRootUser(): string { return this.config.get<string>('MINIO_ROOT_USER', DEFAULTS.minioRootUser); }
  get minioRootPassword(): string { return this.config.get<string>('MINIO_ROOT_PASSWORD', DEFAULTS.minioRootPassword); }
  get s3Region(): string { return this.config.get<string>('S3_REGION', DEFAULTS.s3Region); }
}

export function validateExtractorServiceEnvironment(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const env = { ...raw };
  env.EXTRACTOR_SERVICE_PORT = toPositiveInt(raw.EXTRACTOR_SERVICE_PORT, DEFAULTS.port, 'EXTRACTOR_SERVICE_PORT');
  env.DATABASE_URL = requiredString(raw.DATABASE_URL, 'DATABASE_URL');
  env.RABBITMQ_URL = optionalString(raw.RABBITMQ_URL) ?? DEFAULTS.rabbitmqUrl;
  env.RABBITMQ_EXCHANGE_EVENTS = optionalString(raw.RABBITMQ_EXCHANGE_EVENTS) ?? DEFAULTS.rabbitmqEventsExchange;
  env.EXTRACTOR_SERVICE_QUEUE = optionalString(raw.EXTRACTOR_SERVICE_QUEUE) ?? DEFAULTS.queue;
  env.EXTRACTOR_SERVICE_PREFETCH = toPositiveInt(raw.EXTRACTOR_SERVICE_PREFETCH, DEFAULTS.prefetch, 'EXTRACTOR_SERVICE_PREFETCH');
  env.EXTRACTOR_SERVICE_CONSUMER_NAME = optionalString(raw.EXTRACTOR_SERVICE_CONSUMER_NAME) ?? DEFAULTS.consumerName;
  env.EXTRACTOR_SERVICE_OUTBOX_POLL_INTERVAL_MS = toPositiveInt(
    raw.EXTRACTOR_SERVICE_OUTBOX_POLL_INTERVAL_MS,
    DEFAULTS.outboxPollIntervalMs,
    'EXTRACTOR_SERVICE_OUTBOX_POLL_INTERVAL_MS',
  );
  env.EXTRACTOR_SERVICE_OUTBOX_BATCH_SIZE = toPositiveInt(
    raw.EXTRACTOR_SERVICE_OUTBOX_BATCH_SIZE,
    DEFAULTS.outboxBatchSize,
    'EXTRACTOR_SERVICE_OUTBOX_BATCH_SIZE',
  );
  env.EXTRACTOR_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS = toPositiveInt(
    raw.EXTRACTOR_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS,
    DEFAULTS.outboxMaxPublishAttempts,
    'EXTRACTOR_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS',
  );
  env.EXTRACTOR_SERVICE_INCLUDE_SHA256 = toBoolean(raw.EXTRACTOR_SERVICE_INCLUDE_SHA256, DEFAULTS.includeSha256, 'EXTRACTOR_SERVICE_INCLUDE_SHA256');
  env.EXTRACTOR_SERVICE_IMAGE_METADATA_MIME_TYPES = optionalString(raw.EXTRACTOR_SERVICE_IMAGE_METADATA_MIME_TYPES) ?? DEFAULTS.imageMetadataMimeTypes;
  env.MINIO_ENDPOINT = optionalString(raw.MINIO_ENDPOINT) ?? DEFAULTS.minioEndpoint;
  env.MINIO_API_PORT = toPositiveInt(raw.MINIO_API_PORT, DEFAULTS.minioApiPort, 'MINIO_API_PORT');
  env.MINIO_USE_SSL = toBoolean(raw.MINIO_USE_SSL, DEFAULTS.minioUseSsl, 'MINIO_USE_SSL');
  env.MINIO_ROOT_USER = optionalString(raw.MINIO_ROOT_USER) ?? DEFAULTS.minioRootUser;
  env.MINIO_ROOT_PASSWORD = optionalString(raw.MINIO_ROOT_PASSWORD) ?? DEFAULTS.minioRootPassword;
  env.S3_REGION = optionalString(raw.S3_REGION) ?? DEFAULTS.s3Region;
  return env;
}

function requiredString(v: unknown, n: string): string { const s = optionalString(v); if (!s) throw new Error(`[extractor-service] ${n} is required.`); return s; }
function optionalString(v: unknown): string | undefined { if (typeof v !== 'string') return undefined; const s = v.trim(); return s ? s : undefined; }
function toPositiveInt(v: unknown, fb: number, n: string): number { if (v === undefined || v === null || v === '') return fb; const p = typeof v === 'number' ? v : Number.parseInt(String(v), 10); if (!Number.isFinite(p) || p <= 0) throw new Error(`[extractor-service] ${n} must be a positive integer.`); return Math.trunc(p); }
function toBoolean(v: unknown, fb: boolean, n: string): boolean { if (v === undefined || v === null || v === '') return fb; if (typeof v === 'boolean') return v; const s = String(v).trim().toLowerCase(); if (s === 'true') return true; if (s === 'false') return false; throw new Error(`[extractor-service] ${n} must be "true" or "false".`); }
