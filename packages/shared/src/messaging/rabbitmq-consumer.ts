import { createJsonLogEntry } from '../logging/json-log.js';

export interface RabbitMqConsumerMessageLike {
  content: Buffer;
  fields: {
    routingKey?: unknown;
  };
  properties: {
    messageId?: unknown;
    correlationId?: unknown;
    type?: unknown;
    headers?: unknown;
  };
}

export interface RabbitMqConsumerChannelLike {
  ack(message: unknown, allUpTo?: boolean): unknown;
  nack(message: unknown, allUpTo?: boolean, requeue?: boolean): unknown;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: unknown,
  ): boolean;
}

export interface RetryPolicyDecision {
  action: 'retry' | 'parked';
  queue: string;
  deliveryAttempt: number;
  maxDeliveryAttempts: number;
  dlqExchange?: string;
  dlqRoutingKey?: string;
}

export interface ApplyRetryPolicyInput {
  channel: RabbitMqConsumerChannelLike;
  message: RabbitMqConsumerMessageLike;
  queue: string;
  maxDeliveryAttempts?: number;
  dlqRoutingKey?: string;
  parkingReason?: string;
}

const DEFAULT_MAX_DELIVERY_ATTEMPTS = 3;
const DEFAULT_DLQ_ROUTING_KEY = 'parking';

export function applyRabbitMqRetryPolicy(input: ApplyRetryPolicyInput): RetryPolicyDecision {
  const maxDeliveryAttempts = input.maxDeliveryAttempts ?? DEFAULT_MAX_DELIVERY_ATTEMPTS;
  const deliveryAttempt = getRabbitMqDeliveryAttempt(input.message, input.queue);

  if (deliveryAttempt < maxDeliveryAttempts) {
    input.channel.nack(input.message, false, false);
    return {
      action: 'retry',
      queue: input.queue,
      deliveryAttempt,
      maxDeliveryAttempts,
    };
  }

  const dlqExchange = buildDlqExchangeName(input.queue);
  const dlqRoutingKey = input.dlqRoutingKey ?? DEFAULT_DLQ_ROUTING_KEY;

  const headers = copyHeaders(input.message.properties.headers);
  headers['x-parked-at'] = new Date().toISOString();
  headers['x-parked-from-queue'] = input.queue;
  headers['x-parked-delivery-attempt'] = deliveryAttempt;
  if (input.parkingReason) {
    headers['x-parked-reason'] = input.parkingReason;
  }

  const publishOptions = {
    ...input.message.properties,
    headers,
  };

  input.channel.publish(dlqExchange, dlqRoutingKey, input.message.content, publishOptions);
  input.channel.ack(input.message);

  return {
    action: 'parked',
    queue: input.queue,
    deliveryAttempt,
    maxDeliveryAttempts,
    dlqExchange,
    dlqRoutingKey,
  };
}

export function getRabbitMqDeliveryAttempt(
  message: RabbitMqConsumerMessageLike,
  queue: string,
): number {
  return getRabbitMqQueueDeadLetterCount(message, queue) + 1;
}

export function getRabbitMqQueueDeadLetterCount(
  message: RabbitMqConsumerMessageLike,
  queue: string,
): number {
  const headers = isRecord(message.properties?.headers) ? message.properties.headers : undefined;
  const raw = headers?.['x-death'];
  if (!Array.isArray(raw)) {
    return 0;
  }

  let total = 0;

  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }

    const queueName = typeof item.queue === 'string' ? item.queue : undefined;
    if (queueName !== queue) {
      continue;
    }

    const count = toSafePositiveInt(item.count);
    total += count;
  }

  return total;
}

export function createRabbitMqConsumerJsonLogLine(input: {
  level: 'debug' | 'info' | 'warn' | 'error';
  service: string;
  message: string;
  queue: string;
  amqpMessage?: RabbitMqConsumerMessageLike;
  envelope?: unknown;
  error?: unknown;
  metadata?: Record<string, unknown>;
}): string {
  const envelopeFields = extractEnvelopeFields(input.envelope);
  const amqpFields = input.amqpMessage
    ? {
        routingKey: typeof input.amqpMessage.fields.routingKey === 'string'
          ? input.amqpMessage.fields.routingKey
          : undefined,
        messageId: typeof input.amqpMessage.properties.messageId === 'string'
          ? input.amqpMessage.properties.messageId
          : undefined,
        correlationId: typeof input.amqpMessage.properties.correlationId === 'string'
          ? input.amqpMessage.properties.correlationId
          : undefined,
        messageType: typeof input.amqpMessage.properties.type === 'string'
          ? input.amqpMessage.properties.type
          : undefined,
      }
    : {};

  const fileId = envelopeFields.fileId;
  const userId = envelopeFields.userId;
  const correlationId =
    envelopeFields.correlationId ??
    amqpFields.correlationId ??
    'unknown';

  return JSON.stringify(
    createJsonLogEntry({
      level: input.level,
      service: input.service,
      message: input.message,
      correlationId,
      messageId: envelopeFields.messageId ?? amqpFields.messageId,
      causationId: envelopeFields.causationId,
      messageType: envelopeFields.messageType ?? amqpFields.messageType,
      routingKey: envelopeFields.routingKey ?? amqpFields.routingKey,
      queue: input.queue,
      fileId,
      userId,
      metadata: input.metadata,
      error: input.error,
    }),
  );
}

function extractEnvelopeFields(envelope: unknown): {
  correlationId?: string;
  causationId?: string;
  messageId?: string;
  messageType?: string;
  routingKey?: string;
  fileId?: string;
  userId?: string;
} {
  if (!isRecord(envelope)) {
    return {};
  }

  const payload = isRecord(envelope.payload) ? envelope.payload : undefined;

  return {
    correlationId: typeof envelope.correlationId === 'string' ? envelope.correlationId : undefined,
    causationId: typeof envelope.causationId === 'string' ? envelope.causationId : undefined,
    messageId: typeof envelope.messageId === 'string' ? envelope.messageId : undefined,
    messageType: typeof envelope.type === 'string' ? envelope.type : undefined,
    routingKey: typeof envelope.routingKey === 'string' ? envelope.routingKey : undefined,
    fileId: typeof payload?.fileId === 'string' ? payload.fileId : undefined,
    userId: typeof payload?.userId === 'string' ? payload.userId : undefined,
  };
}

function buildDlqExchangeName(queue: string): string {
  return `dlq.${queue}`;
}

function copyHeaders(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  return { ...value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSafePositiveInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  if (typeof value === 'bigint' && value > 0n) {
    return Number(value);
  }

  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.trunc(parsed);
}
