import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULTS = {
  port: 3000,
  rabbitmqUrl: 'amqp://event:event@localhost:5672',
  rabbitmqCommandsExchange: 'domain.commands',
  rabbitmqManagementApiBaseUrl: 'http://localhost:15672/api',
  rabbitmqManagementUser: 'event',
  rabbitmqManagementPassword: 'event',
  rabbitmqVhost: '/',
  minioEndpoint: 'localhost',
  minioApiPort: 9000,
  minioUseSsl: false,
  minioRootUser: 'minioadmin',
  minioRootPassword: 'minioadmin',
  s3Region: 'us-east-1',
  minioUploadsBucket: 'uploads',
  uploadObjectKeyPrefix: 'raw',
  presignedExpiresSeconds: 900,
  authDevBypass: false,
  jwtAudience: '',
  jwtJwksCacheTtlMs: 300000,
} as const;

export const API_GATEWAY_ENV_FILE_PATHS = [
  '.env.local',
  '.env',
  '../../.env.local',
  '../../.env',
];

@Injectable()
export class ApiGatewayConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number { return this.config.get<number>('API_GATEWAY_PORT', DEFAULTS.port); }
  get rabbitmqUrl(): string { return this.config.get<string>('RABBITMQ_URL', DEFAULTS.rabbitmqUrl); }
  get rabbitmqCommandsExchange(): string {
    return this.config.get<string>('RABBITMQ_EXCHANGE_COMMANDS', DEFAULTS.rabbitmqCommandsExchange);
  }
  get rabbitmqManagementApiBaseUrl(): string {
    return this.config.get<string>(
      'RABBITMQ_MANAGEMENT_API_URL',
      DEFAULTS.rabbitmqManagementApiBaseUrl,
    );
  }
  get rabbitmqManagementUser(): string {
    return this.config.get<string>('RABBITMQ_MANAGEMENT_USER', DEFAULTS.rabbitmqManagementUser);
  }
  get rabbitmqManagementPassword(): string {
    return this.config.get<string>(
      'RABBITMQ_MANAGEMENT_PASSWORD',
      DEFAULTS.rabbitmqManagementPassword,
    );
  }
  get rabbitmqVhost(): string {
    return this.config.get<string>('RABBITMQ_VHOST', DEFAULTS.rabbitmqVhost);
  }
  get minioEndpoint(): string { return this.config.get<string>('MINIO_ENDPOINT', DEFAULTS.minioEndpoint); }
  get minioApiPort(): number { return this.config.get<number>('MINIO_API_PORT', DEFAULTS.minioApiPort); }
  get minioUseSsl(): boolean { return this.config.get<boolean>('MINIO_USE_SSL', DEFAULTS.minioUseSsl); }
  get minioRootUser(): string { return this.config.get<string>('MINIO_ROOT_USER', DEFAULTS.minioRootUser); }
  get minioRootPassword(): string {
    return this.config.get<string>('MINIO_ROOT_PASSWORD', DEFAULTS.minioRootPassword);
  }
  get s3Region(): string { return this.config.get<string>('S3_REGION', DEFAULTS.s3Region); }
  get minioUploadsBucket(): string {
    return this.config.get<string>('MINIO_BUCKET_UPLOADS', DEFAULTS.minioUploadsBucket);
  }
  get uploadObjectKeyPrefix(): string {
    return this.config.get<string>('UPLOAD_SERVICE_OBJECT_KEY_PREFIX', DEFAULTS.uploadObjectKeyPrefix);
  }
  get presignedExpiresSeconds(): number {
    return this.config.get<number>(
      'API_GATEWAY_UPLOAD_PRESIGNED_EXPIRES_SECONDS',
      DEFAULTS.presignedExpiresSeconds,
    );
  }
  get authDevBypassEnabled(): boolean {
    return this.config.get<boolean>('API_GATEWAY_AUTH_DEV_BYPASS', DEFAULTS.authDevBypass);
  }
  get jwtIssuerUrl(): string | undefined {
    return optionalString(this.config.get<string>('JWT_ISSUER_URL'));
  }
  get jwtAudience(): string | undefined {
    return optionalString(this.config.get<string>('JWT_AUDIENCE', DEFAULTS.jwtAudience));
  }
  get jwtJwksUrl(): string | undefined {
    return optionalString(this.config.get<string>('JWT_JWKS_URL'));
  }
  get jwtJwksCacheTtlMs(): number {
    return this.config.get<number>('JWT_JWKS_CACHE_TTL_MS', DEFAULTS.jwtJwksCacheTtlMs);
  }
}

export function validateApiGatewayEnvironment(raw: Record<string, unknown>): Record<string, unknown> {
  const env = { ...raw };
  env.API_GATEWAY_PORT = toPositiveInt(raw.API_GATEWAY_PORT, DEFAULTS.port, 'API_GATEWAY_PORT');
  env.RABBITMQ_URL = optionalString(raw.RABBITMQ_URL) ?? DEFAULTS.rabbitmqUrl;
  env.RABBITMQ_EXCHANGE_COMMANDS = optionalString(raw.RABBITMQ_EXCHANGE_COMMANDS) ?? DEFAULTS.rabbitmqCommandsExchange;
  env.RABBITMQ_MANAGEMENT_API_URL =
    optionalString(raw.RABBITMQ_MANAGEMENT_API_URL) ??
    deriveRabbitMqManagementApiUrl(raw, env.RABBITMQ_URL as string);
  env.RABBITMQ_MANAGEMENT_USER =
    optionalString(raw.RABBITMQ_MANAGEMENT_USER) ??
    deriveRabbitMqManagementUser(env.RABBITMQ_URL as string);
  env.RABBITMQ_MANAGEMENT_PASSWORD =
    optionalString(raw.RABBITMQ_MANAGEMENT_PASSWORD) ??
    deriveRabbitMqManagementPassword(env.RABBITMQ_URL as string);
  env.RABBITMQ_VHOST = optionalString(raw.RABBITMQ_VHOST) ?? DEFAULTS.rabbitmqVhost;
  env.MINIO_ENDPOINT = optionalString(raw.MINIO_ENDPOINT) ?? DEFAULTS.minioEndpoint;
  env.MINIO_API_PORT = toPositiveInt(raw.MINIO_API_PORT, DEFAULTS.minioApiPort, 'MINIO_API_PORT');
  env.MINIO_USE_SSL = toBoolean(raw.MINIO_USE_SSL, DEFAULTS.minioUseSsl, 'MINIO_USE_SSL');
  env.MINIO_ROOT_USER = optionalString(raw.MINIO_ROOT_USER) ?? DEFAULTS.minioRootUser;
  env.MINIO_ROOT_PASSWORD = optionalString(raw.MINIO_ROOT_PASSWORD) ?? DEFAULTS.minioRootPassword;
  env.S3_REGION = optionalString(raw.S3_REGION) ?? DEFAULTS.s3Region;
  env.MINIO_BUCKET_UPLOADS = optionalString(raw.MINIO_BUCKET_UPLOADS) ?? DEFAULTS.minioUploadsBucket;
  env.UPLOAD_SERVICE_OBJECT_KEY_PREFIX = optionalString(raw.UPLOAD_SERVICE_OBJECT_KEY_PREFIX) ?? DEFAULTS.uploadObjectKeyPrefix;
  env.API_GATEWAY_UPLOAD_PRESIGNED_EXPIRES_SECONDS = toPositiveInt(
    raw.API_GATEWAY_UPLOAD_PRESIGNED_EXPIRES_SECONDS,
    DEFAULTS.presignedExpiresSeconds,
    'API_GATEWAY_UPLOAD_PRESIGNED_EXPIRES_SECONDS',
  );
  env.API_GATEWAY_AUTH_DEV_BYPASS = toBoolean(
    raw.API_GATEWAY_AUTH_DEV_BYPASS,
    DEFAULTS.authDevBypass,
    'API_GATEWAY_AUTH_DEV_BYPASS',
  );
  env.JWT_AUDIENCE = optionalString(raw.JWT_AUDIENCE) ?? DEFAULTS.jwtAudience;
  env.JWT_JWKS_URL = optionalString(raw.JWT_JWKS_URL) ?? '';
  env.JWT_JWKS_CACHE_TTL_MS = toPositiveInt(
    raw.JWT_JWKS_CACHE_TTL_MS,
    DEFAULTS.jwtJwksCacheTtlMs,
    'JWT_JWKS_CACHE_TTL_MS',
  );

  const devBypass = env.API_GATEWAY_AUTH_DEV_BYPASS as boolean;
  const issuer = optionalString(raw.JWT_ISSUER_URL);
  if (!devBypass && !issuer) {
    throw new Error('[api-gateway] JWT_ISSUER_URL is required when API_GATEWAY_AUTH_DEV_BYPASS=false.');
  }
  env.JWT_ISSUER_URL = issuer ?? '';

  return env;
}

function deriveRabbitMqManagementApiUrl(raw: Record<string, unknown>, rabbitmqUrl: string): string {
  const host = optionalString(raw.RABBITMQ_HOST);
  const port = optionalString(raw.RABBITMQ_MANAGEMENT_PORT);

  if (host) {
    return `http://${host}:${port ?? '15672'}/api`;
  }

  try {
    const parsed = new URL(rabbitmqUrl);
    return `http://${parsed.hostname}:15672/api`;
  } catch {
    return DEFAULTS.rabbitmqManagementApiBaseUrl;
  }
}

function deriveRabbitMqManagementUser(rabbitmqUrl: string): string {
  try {
    const parsed = new URL(rabbitmqUrl);
    return parsed.username || DEFAULTS.rabbitmqManagementUser;
  } catch {
    return DEFAULTS.rabbitmqManagementUser;
  }
}

function deriveRabbitMqManagementPassword(rabbitmqUrl: string): string {
  try {
    const parsed = new URL(rabbitmqUrl);
    return parsed.password || DEFAULTS.rabbitmqManagementPassword;
  } catch {
    return DEFAULTS.rabbitmqManagementPassword;
  }
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
    throw new Error(`[api-gateway] ${name} must be a positive integer.`);
  }
  return Math.trunc(parsed);
}

function toBoolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`[api-gateway] ${name} must be "true" or "false".`);
}
