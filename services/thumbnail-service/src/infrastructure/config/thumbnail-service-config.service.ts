import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULTS = {
  port: 3004,
  databaseUrl: undefined,
  rabbitmqUrl: 'amqp://event:event@localhost:5672',
  rabbitmqEventsExchange: 'domain.events',
  queue: 'q.thumbnail',
  prefetch: 10,
  consumerName: 'thumbnail:file-validated',
  supportedMimeTypes: 'image/png,image/jpeg,image/webp',
  width: 320,
  height: 320,
  webpQuality: 82,
  thumbnailsBucket: 'thumbnails',
  objectKeyPrefix: 'thumbnails',
  minioEndpoint: 'localhost',
  minioApiPort: 9000,
  minioUseSsl: false,
  minioRootUser: 'minioadmin',
  minioRootPassword: 'minioadmin',
  s3Region: 'us-east-1',
} as const;

export const THUMBNAIL_SERVICE_ENV_FILE_PATHS = [
  '.env.local',
  '.env',
  '../../.env.local',
  '../../.env',
];

@Injectable()
export class ThumbnailServiceConfigService {
  constructor(private readonly config: ConfigService) {}
  get port(): number { return this.config.get<number>('THUMBNAIL_SERVICE_PORT', DEFAULTS.port); }
  get databaseUrl(): string { return this.config.getOrThrow<string>('DATABASE_URL'); }
  get rabbitmqUrl(): string { return this.config.get<string>('RABBITMQ_URL', DEFAULTS.rabbitmqUrl); }
  get rabbitmqEventsExchange(): string {
    return this.config.get<string>('RABBITMQ_EXCHANGE_EVENTS', DEFAULTS.rabbitmqEventsExchange);
  }
  get queue(): string { return this.config.get<string>('THUMBNAIL_SERVICE_QUEUE', DEFAULTS.queue); }
  get prefetch(): number { return this.config.get<number>('THUMBNAIL_SERVICE_PREFETCH', DEFAULTS.prefetch); }
  get consumerName(): string {
    return this.config.get<string>('THUMBNAIL_SERVICE_CONSUMER_NAME', DEFAULTS.consumerName);
  }
  get supportedMimeTypesCsv(): string {
    return this.config.get<string>('THUMBNAIL_SERVICE_SUPPORTED_MIME_TYPES', DEFAULTS.supportedMimeTypes);
  }
  get width(): number { return this.config.get<number>('THUMBNAIL_SERVICE_WIDTH', DEFAULTS.width); }
  get height(): number { return this.config.get<number>('THUMBNAIL_SERVICE_HEIGHT', DEFAULTS.height); }
  get webpQuality(): number {
    return this.config.get<number>('THUMBNAIL_SERVICE_WEBP_QUALITY', DEFAULTS.webpQuality);
  }
  get thumbnailsBucket(): string {
    return this.config.get<string>('MINIO_BUCKET_THUMBNAILS', DEFAULTS.thumbnailsBucket);
  }
  get objectKeyPrefix(): string {
    return this.config.get<string>('THUMBNAIL_SERVICE_OBJECT_KEY_PREFIX', DEFAULTS.objectKeyPrefix);
  }
  get minioEndpoint(): string { return this.config.get<string>('MINIO_ENDPOINT', DEFAULTS.minioEndpoint); }
  get minioApiPort(): number { return this.config.get<number>('MINIO_API_PORT', DEFAULTS.minioApiPort); }
  get minioUseSsl(): boolean { return this.config.get<boolean>('MINIO_USE_SSL', DEFAULTS.minioUseSsl); }
  get minioRootUser(): string { return this.config.get<string>('MINIO_ROOT_USER', DEFAULTS.minioRootUser); }
  get minioRootPassword(): string {
    return this.config.get<string>('MINIO_ROOT_PASSWORD', DEFAULTS.minioRootPassword);
  }
  get s3Region(): string { return this.config.get<string>('S3_REGION', DEFAULTS.s3Region); }
}

export function validateThumbnailServiceEnvironment(raw: Record<string, unknown>): Record<string, unknown> {
  const env = { ...raw };
  env.THUMBNAIL_SERVICE_PORT = toPositiveInt(raw.THUMBNAIL_SERVICE_PORT, DEFAULTS.port, 'THUMBNAIL_SERVICE_PORT');
  env.DATABASE_URL = requiredString(raw.DATABASE_URL, 'DATABASE_URL');
  env.RABBITMQ_URL = optionalString(raw.RABBITMQ_URL) ?? DEFAULTS.rabbitmqUrl;
  env.RABBITMQ_EXCHANGE_EVENTS = optionalString(raw.RABBITMQ_EXCHANGE_EVENTS) ?? DEFAULTS.rabbitmqEventsExchange;
  env.THUMBNAIL_SERVICE_QUEUE = optionalString(raw.THUMBNAIL_SERVICE_QUEUE) ?? DEFAULTS.queue;
  env.THUMBNAIL_SERVICE_PREFETCH = toPositiveInt(raw.THUMBNAIL_SERVICE_PREFETCH, DEFAULTS.prefetch, 'THUMBNAIL_SERVICE_PREFETCH');
  env.THUMBNAIL_SERVICE_CONSUMER_NAME = optionalString(raw.THUMBNAIL_SERVICE_CONSUMER_NAME) ?? DEFAULTS.consumerName;
  env.THUMBNAIL_SERVICE_SUPPORTED_MIME_TYPES = optionalString(raw.THUMBNAIL_SERVICE_SUPPORTED_MIME_TYPES) ?? DEFAULTS.supportedMimeTypes;
  env.THUMBNAIL_SERVICE_WIDTH = toPositiveInt(raw.THUMBNAIL_SERVICE_WIDTH, DEFAULTS.width, 'THUMBNAIL_SERVICE_WIDTH');
  env.THUMBNAIL_SERVICE_HEIGHT = toPositiveInt(raw.THUMBNAIL_SERVICE_HEIGHT, DEFAULTS.height, 'THUMBNAIL_SERVICE_HEIGHT');
  env.THUMBNAIL_SERVICE_WEBP_QUALITY = toRangeInt(raw.THUMBNAIL_SERVICE_WEBP_QUALITY, DEFAULTS.webpQuality, 1, 100, 'THUMBNAIL_SERVICE_WEBP_QUALITY');
  env.MINIO_BUCKET_THUMBNAILS = optionalString(raw.MINIO_BUCKET_THUMBNAILS) ?? DEFAULTS.thumbnailsBucket;
  env.THUMBNAIL_SERVICE_OBJECT_KEY_PREFIX = optionalString(raw.THUMBNAIL_SERVICE_OBJECT_KEY_PREFIX) ?? DEFAULTS.objectKeyPrefix;
  env.MINIO_ENDPOINT = optionalString(raw.MINIO_ENDPOINT) ?? DEFAULTS.minioEndpoint;
  env.MINIO_API_PORT = toPositiveInt(raw.MINIO_API_PORT, DEFAULTS.minioApiPort, 'MINIO_API_PORT');
  env.MINIO_USE_SSL = toBoolean(raw.MINIO_USE_SSL, DEFAULTS.minioUseSsl, 'MINIO_USE_SSL');
  env.MINIO_ROOT_USER = optionalString(raw.MINIO_ROOT_USER) ?? DEFAULTS.minioRootUser;
  env.MINIO_ROOT_PASSWORD = optionalString(raw.MINIO_ROOT_PASSWORD) ?? DEFAULTS.minioRootPassword;
  env.S3_REGION = optionalString(raw.S3_REGION) ?? DEFAULTS.s3Region;
  return env;
}

function requiredString(v: unknown, n: string): string { const s = optionalString(v); if (!s) throw new Error(`[thumbnail-service] ${n} is required.`); return s; }
function optionalString(v: unknown): string | undefined { if (typeof v !== 'string') return undefined; const s = v.trim(); return s ? s : undefined; }
function toPositiveInt(v: unknown, fb: number, n: string): number { if (v === undefined || v === null || v === '') return fb; const p = typeof v === 'number' ? v : Number.parseInt(String(v), 10); if (!Number.isFinite(p) || p <= 0) throw new Error(`[thumbnail-service] ${n} must be a positive integer.`); return Math.trunc(p); }
function toRangeInt(v: unknown, fb: number, min: number, max: number, n: string): number { const p = toPositiveInt(v, fb, n); if (p < min || p > max) throw new Error(`[thumbnail-service] ${n} must be between ${min} and ${max}.`); return p; }
function toBoolean(v: unknown, fb: boolean, n: string): boolean { if (v === undefined || v === null || v === '') return fb; if (typeof v === 'boolean') return v; const s = String(v).trim().toLowerCase(); if (s === 'true') return true; if (s === 'false') return false; throw new Error(`[thumbnail-service] ${n} must be "true" or "false".`); }
