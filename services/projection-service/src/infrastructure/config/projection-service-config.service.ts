import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULTS = {
  port: 3001,
  rabbitmqUrl: 'amqp://event:event@localhost:5672',
  rabbitmqEventsExchange: 'domain.events',
  queue: 'q.projection',
  prefetch: 50,
  consumerName: 'projection:events',
  outboxPollIntervalMs: 2000,
  outboxBatchSize: 50,
  outboxMaxPublishAttempts: 5,
  processManagerShadowEnabled: true,
  processManagerShadowConsumerName: 'process-manager:shadow',
  processManagerTimeoutMs: 300000,
  processManagerTimeoutSweepIntervalMs: 10000,
} as const;

export const PROJECTION_SERVICE_ENV_FILE_PATHS = [
  '.env.local',
  '.env',
  '../../.env.local',
  '../../.env',
];

@Injectable()
export class ProjectionServiceConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return this.config.get<number>('PROJECTION_SERVICE_PORT', DEFAULTS.port);
  }

  get databaseUrl(): string {
    return this.config.getOrThrow<string>('DATABASE_URL');
  }

  get rabbitmqUrl(): string {
    return this.config.get<string>('RABBITMQ_URL', DEFAULTS.rabbitmqUrl);
  }

  get queue(): string {
    return this.config.get<string>('PROJECTION_SERVICE_QUEUE', DEFAULTS.queue);
  }

  get rabbitmqEventsExchange(): string {
    return this.config.get<string>('RABBITMQ_EXCHANGE_EVENTS', DEFAULTS.rabbitmqEventsExchange);
  }

  get prefetch(): number {
    return this.config.get<number>('PROJECTION_SERVICE_PREFETCH', DEFAULTS.prefetch);
  }

  get consumerName(): string {
    return this.config.get<string>('PROJECTION_SERVICE_CONSUMER_NAME', DEFAULTS.consumerName);
  }

  get outboxPollIntervalMs(): number {
    return this.config.get<number>(
      'PROJECTION_SERVICE_OUTBOX_POLL_INTERVAL_MS',
      DEFAULTS.outboxPollIntervalMs,
    );
  }

  get outboxBatchSize(): number {
    return this.config.get<number>('PROJECTION_SERVICE_OUTBOX_BATCH_SIZE', DEFAULTS.outboxBatchSize);
  }

  get outboxMaxPublishAttempts(): number {
    return this.config.get<number>(
      'PROJECTION_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS',
      DEFAULTS.outboxMaxPublishAttempts,
    );
  }

  get processManagerShadowEnabled(): boolean {
    return this.config.get<boolean>(
      'PROJECTION_PROCESS_MANAGER_SHADOW_ENABLED',
      DEFAULTS.processManagerShadowEnabled,
    );
  }

  get processManagerShadowConsumerName(): string {
    return this.config.get<string>(
      'PROJECTION_PROCESS_MANAGER_SHADOW_CONSUMER_NAME',
      DEFAULTS.processManagerShadowConsumerName,
    );
  }

  get processManagerTimeoutMs(): number {
    return this.config.get<number>(
      'PROJECTION_PROCESS_MANAGER_TIMEOUT_MS',
      DEFAULTS.processManagerTimeoutMs,
    );
  }

  get processManagerTimeoutSweepIntervalMs(): number {
    return this.config.get<number>(
      'PROJECTION_PROCESS_MANAGER_TIMEOUT_SWEEP_INTERVAL_MS',
      DEFAULTS.processManagerTimeoutSweepIntervalMs,
    );
  }
}

export function validateProjectionServiceEnvironment(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const env = { ...raw };
  env.PROJECTION_SERVICE_PORT = toPositiveInt(raw.PROJECTION_SERVICE_PORT, DEFAULTS.port, 'PROJECTION_SERVICE_PORT');
  env.DATABASE_URL = requiredString(raw.DATABASE_URL, 'DATABASE_URL');
  env.RABBITMQ_URL = optionalString(raw.RABBITMQ_URL) ?? DEFAULTS.rabbitmqUrl;
  env.RABBITMQ_EXCHANGE_EVENTS =
    optionalString(raw.RABBITMQ_EXCHANGE_EVENTS) ?? DEFAULTS.rabbitmqEventsExchange;
  env.PROJECTION_SERVICE_QUEUE = optionalString(raw.PROJECTION_SERVICE_QUEUE) ?? DEFAULTS.queue;
  env.PROJECTION_SERVICE_PREFETCH = toPositiveInt(
    raw.PROJECTION_SERVICE_PREFETCH,
    DEFAULTS.prefetch,
    'PROJECTION_SERVICE_PREFETCH',
  );
  env.PROJECTION_SERVICE_CONSUMER_NAME =
    optionalString(raw.PROJECTION_SERVICE_CONSUMER_NAME) ?? DEFAULTS.consumerName;
  env.PROJECTION_SERVICE_OUTBOX_POLL_INTERVAL_MS = toPositiveInt(
    raw.PROJECTION_SERVICE_OUTBOX_POLL_INTERVAL_MS,
    DEFAULTS.outboxPollIntervalMs,
    'PROJECTION_SERVICE_OUTBOX_POLL_INTERVAL_MS',
  );
  env.PROJECTION_SERVICE_OUTBOX_BATCH_SIZE = toPositiveInt(
    raw.PROJECTION_SERVICE_OUTBOX_BATCH_SIZE,
    DEFAULTS.outboxBatchSize,
    'PROJECTION_SERVICE_OUTBOX_BATCH_SIZE',
  );
  env.PROJECTION_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS = toPositiveInt(
    raw.PROJECTION_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS,
    DEFAULTS.outboxMaxPublishAttempts,
    'PROJECTION_SERVICE_OUTBOX_MAX_PUBLISH_ATTEMPTS',
  );
  env.PROJECTION_PROCESS_MANAGER_SHADOW_ENABLED = toBoolean(
    raw.PROJECTION_PROCESS_MANAGER_SHADOW_ENABLED,
    DEFAULTS.processManagerShadowEnabled,
    'PROJECTION_PROCESS_MANAGER_SHADOW_ENABLED',
  );
  env.PROJECTION_PROCESS_MANAGER_SHADOW_CONSUMER_NAME =
    optionalString(raw.PROJECTION_PROCESS_MANAGER_SHADOW_CONSUMER_NAME) ??
    DEFAULTS.processManagerShadowConsumerName;
  env.PROJECTION_PROCESS_MANAGER_TIMEOUT_MS = toPositiveInt(
    raw.PROJECTION_PROCESS_MANAGER_TIMEOUT_MS,
    DEFAULTS.processManagerTimeoutMs,
    'PROJECTION_PROCESS_MANAGER_TIMEOUT_MS',
  );
  env.PROJECTION_PROCESS_MANAGER_TIMEOUT_SWEEP_INTERVAL_MS = toPositiveInt(
    raw.PROJECTION_PROCESS_MANAGER_TIMEOUT_SWEEP_INTERVAL_MS,
    DEFAULTS.processManagerTimeoutSweepIntervalMs,
    'PROJECTION_PROCESS_MANAGER_TIMEOUT_SWEEP_INTERVAL_MS',
  );
  return env;
}

function requiredString(value: unknown, name: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new Error(`[projection-service] ${name} is required.`);
  }
  return normalized;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toBoolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error(`[projection-service] ${name} must be "true" or "false".`);
}

function toPositiveInt(value: unknown, fallback: number, name: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[projection-service] ${name} must be a positive integer.`);
  }
  return Math.trunc(parsed);
}
