import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULTS = {
  port: 3007,
  rabbitmqUrl: 'amqp://event:event@localhost:5672',
  queue: 'q.audit',
  prefetch: 100,
  consumerName: 'audit:events',
  payloadSummaryMaxDepth: 3,
  payloadSummaryMaxArrayItems: 10,
  payloadSummaryMaxStringLength: 200,
} as const;

export const AUDIT_SERVICE_ENV_FILE_PATHS = [
  '.env.local',
  '.env',
  '../../.env.local',
  '../../.env',
];

@Injectable()
export class AuditServiceConfigService {
  constructor(private readonly config: ConfigService) {}

  get port(): number {
    return this.config.get<number>('AUDIT_SERVICE_PORT', DEFAULTS.port);
  }

  get databaseUrl(): string {
    return this.config.getOrThrow<string>('DATABASE_URL');
  }

  get rabbitmqUrl(): string {
    return this.config.get<string>('RABBITMQ_URL', DEFAULTS.rabbitmqUrl);
  }

  get queue(): string {
    return this.config.get<string>('AUDIT_SERVICE_QUEUE', DEFAULTS.queue);
  }

  get prefetch(): number {
    return this.config.get<number>('AUDIT_SERVICE_PREFETCH', DEFAULTS.prefetch);
  }

  get consumerName(): string {
    return this.config.get<string>('AUDIT_SERVICE_CONSUMER_NAME', DEFAULTS.consumerName);
  }

  get payloadSummaryMaxDepth(): number {
    return this.config.get<number>(
      'AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_DEPTH',
      DEFAULTS.payloadSummaryMaxDepth,
    );
  }

  get payloadSummaryMaxArrayItems(): number {
    return this.config.get<number>(
      'AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_ARRAY_ITEMS',
      DEFAULTS.payloadSummaryMaxArrayItems,
    );
  }

  get payloadSummaryMaxStringLength(): number {
    return this.config.get<number>(
      'AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_STRING_LENGTH',
      DEFAULTS.payloadSummaryMaxStringLength,
    );
  }
}

export function validateAuditServiceEnvironment(raw: Record<string, unknown>): Record<string, unknown> {
  const env = { ...raw };

  env.AUDIT_SERVICE_PORT = toPositiveInt(raw.AUDIT_SERVICE_PORT, DEFAULTS.port, 'AUDIT_SERVICE_PORT');
  env.DATABASE_URL = requiredString(raw.DATABASE_URL, 'DATABASE_URL');
  env.RABBITMQ_URL = optionalString(raw.RABBITMQ_URL) ?? DEFAULTS.rabbitmqUrl;
  env.AUDIT_SERVICE_QUEUE = optionalString(raw.AUDIT_SERVICE_QUEUE) ?? DEFAULTS.queue;
  env.AUDIT_SERVICE_PREFETCH = toPositiveInt(raw.AUDIT_SERVICE_PREFETCH, DEFAULTS.prefetch, 'AUDIT_SERVICE_PREFETCH');
  env.AUDIT_SERVICE_CONSUMER_NAME =
    optionalString(raw.AUDIT_SERVICE_CONSUMER_NAME) ?? DEFAULTS.consumerName;
  env.AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_DEPTH = toPositiveInt(
    raw.AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_DEPTH,
    DEFAULTS.payloadSummaryMaxDepth,
    'AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_DEPTH',
  );
  env.AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_ARRAY_ITEMS = toPositiveInt(
    raw.AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_ARRAY_ITEMS,
    DEFAULTS.payloadSummaryMaxArrayItems,
    'AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_ARRAY_ITEMS',
  );
  env.AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_STRING_LENGTH = toPositiveInt(
    raw.AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_STRING_LENGTH,
    DEFAULTS.payloadSummaryMaxStringLength,
    'AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_STRING_LENGTH',
  );

  return env;
}

function requiredString(value: unknown, name: string): string {
  const normalized = optionalString(value);
  if (!normalized) {
    throw new Error(`[audit-service] ${name} is required.`);
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
    throw new Error(`[audit-service] ${name} must be a positive integer.`);
  }
  return Math.trunc(parsed);
}
