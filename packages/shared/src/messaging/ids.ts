import type { MessageEnvelope } from './envelope.js';

export interface TraceIds {
  correlationId: string;
  causationId?: string;
}

function randomHex(length: number): string {
  let value = '';
  while (value.length < length) {
    value += Math.floor(Math.random() * 16).toString(16);
  }
  return value.slice(0, length);
}

function fallbackUuid(): string {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-a${randomHex(3)}-${randomHex(12)}`;
}

export function generateId(): string {
  return globalThis.crypto?.randomUUID?.() ?? fallbackUuid();
}

export function generateCorrelationId(): string {
  return generateId();
}

export function ensureCorrelationId(correlationId?: string): string {
  return correlationId && correlationId.trim().length > 0 ? correlationId : generateCorrelationId();
}

export function deriveCausationId(
  source?: Pick<MessageEnvelope, 'messageId'> | string | null,
): string | undefined {
  if (!source) {
    return undefined;
  }

  if (typeof source === 'string') {
    return source;
  }

  return source.messageId;
}

export function createTraceIds(
  source?: Pick<MessageEnvelope, 'messageId' | 'correlationId'> | null,
): TraceIds {
  return {
    correlationId: source?.correlationId ?? generateCorrelationId(),
    causationId: source?.messageId,
  };
}
