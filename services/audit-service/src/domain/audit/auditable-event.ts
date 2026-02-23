import type { EventEnvelope } from '@event-pipeline/shared';

export type AuditableEvent = EventEnvelope<Record<string, unknown>, string>;

export interface AuditableEventWithRoutingKey {
  event: AuditableEvent;
  routingKey?: string;
}

export interface AuditPayloadSummaryOptions {
  maxDepth: number;
  maxArrayItems: number;
  maxStringLength: number;
}

export function isAuditableEvent(value: unknown): value is AuditableEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== 'event' ||
    typeof candidate.messageId !== 'string' ||
    typeof candidate.type !== 'string' ||
    typeof candidate.occurredAt !== 'string' ||
    typeof candidate.correlationId !== 'string' ||
    typeof candidate.producer !== 'string' ||
    typeof candidate.version !== 'number'
  ) {
    return false;
  }

  return typeof candidate.payload === 'object' && candidate.payload !== null;
}

export function summarizePayloadForAudit(
  payload: unknown,
  options: Partial<AuditPayloadSummaryOptions> = {},
): Record<string, unknown> {
  const resolved: AuditPayloadSummaryOptions = {
    maxDepth: options.maxDepth ?? 3,
    maxArrayItems: options.maxArrayItems ?? 10,
    maxStringLength: options.maxStringLength ?? 200,
  };

  const summary = summarizeUnknown(payload, resolved, 0);
  if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
    return summary as Record<string, unknown>;
  }

  return {
    value: summary,
  };
}

function summarizeUnknown(
  value: unknown,
  options: AuditPayloadSummaryOptions,
  depth: number,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value, options.maxStringLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return `<Buffer length=${value.length}>`;
  }

  if (Array.isArray(value)) {
    if (depth >= options.maxDepth) {
      return {
        type: 'array',
        length: value.length,
      };
    }

    const sliced = value.slice(0, options.maxArrayItems).map((item) =>
      summarizeUnknown(item, options, depth + 1),
    );

    return value.length > options.maxArrayItems
      ? {
          items: sliced,
          totalItems: value.length,
          truncated: true,
        }
      : sliced;
  }

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();

    if (depth >= options.maxDepth) {
      return {
        type: 'object',
        keys,
      };
    }

    const summary: Record<string, unknown> = {};
    for (const key of keys) {
      summary[key] = summarizeUnknown(objectValue[key], options, depth + 1);
    }
    return summary;
  }

  return String(value);
}

function truncateString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}…`;
}
