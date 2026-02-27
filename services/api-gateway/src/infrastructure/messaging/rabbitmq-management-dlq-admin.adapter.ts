import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { once } from 'node:events';
import * as amqp from 'amqplib';
import {
  createEnvelope,
  createJsonLogEntry,
  generateId,
} from '@event-pipeline/shared';
import type {
  DlqAdminPort,
  DlqPeekInput,
  DlqPeekMessage,
  DlqQueueSnapshot,
  DlqRedriveInput,
  DlqRedriveResult,
} from '../../application/admin-dlq/ports/dlq-admin.port';
import { listKnownDlqQueueTargets, resolveKnownDlqQueueTarget } from '../../domain/admin/dlq-queue';
import { ApiGatewayConfigService } from '../config/api-gateway-config.service';

interface RabbitQueueDto {
  name: string;
  messages?: number;
  messages_ready?: number;
  messages_unacknowledged?: number;
  consumers?: number;
  state?: string;
  idle_since?: string;
}

interface RabbitQueueGetMessageDto {
  message_count?: number;
  redelivered?: boolean;
  exchange?: string;
  routing_key?: string;
  payload?: unknown;
  payload_encoding?: string;
  properties?: Record<string, unknown>;
}

interface ParsedEnvelopeSummary {
  messageId?: string;
  type?: string;
  correlationId?: string;
}

interface DlqRedriveCompletedEventPayload {
  operationCorrelationId: string;
  queue: string;
  mainQueue: string;
  retryExchange: string;
  requested: number;
  fetched: number;
  moved: number;
  failed: number;
  requestedByUserId: string;
  requestedByUserName: string;
  failures: Array<{ index: number; reason: string }>;
}

const DLQ_REDRIVE_COMPLETED_EVENT_TYPE = 'DlqRedriveCompleted.v1' as const;
const DLQ_REDRIVE_COMPLETED_ROUTING_KEY = 'operations.dlq.redrive.completed.v1' as const;

@Injectable()
export class RabbitMqManagementDlqAdminAdapter implements DlqAdminPort, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqManagementDlqAdminAdapter.name);
  private redriveConnection?: amqp.ChannelModel;
  private redriveChannel?: amqp.ConfirmChannel;
  private redriveChannelPromise?: Promise<amqp.ConfirmChannel>;

  constructor(private readonly config: ApiGatewayConfigService) {}

  async listQueues(): Promise<DlqQueueSnapshot[]> {
    const allQueues = await this.requestJson<RabbitQueueDto[]>('GET', this.path(`/queues/${this.encodedVhost}`));
    const queueMap = new Map(allQueues.map((queue) => [queue.name, queue]));

    return listKnownDlqQueueTargets().map((target) => {
      const queue = queueMap.get(target.dlqQueue);
      return {
        queue: target.dlqQueue,
        mainQueue: target.mainQueue,
        retryExchange: target.retryExchange,
        label: target.label,
        messages: queue?.messages ?? 0,
        messagesReady: queue?.messages_ready ?? 0,
        messagesUnacknowledged: queue?.messages_unacknowledged ?? 0,
        consumers: queue?.consumers ?? 0,
        state: queue?.state,
        idleSince: queue?.idle_since,
      };
    });
  }

  async peekMessages(input: DlqPeekInput): Promise<DlqPeekMessage[]> {
    const target = resolveKnownDlqQueueTarget(input.queue);
    if (!target) {
      return [];
    }

    const messages = await this.readFromQueue(target.dlqQueue, input.limit, 'ack_requeue_true');
    return messages.map((message) => this.toPeekMessage(message));
  }

  async redriveMessages(input: DlqRedriveInput): Promise<DlqRedriveResult> {
    const target = resolveKnownDlqQueueTarget(input.queue);
    if (!target) {
      throw new ServiceUnavailableException(`Unsupported DLQ queue "${input.queue}".`);
    }

    const channel = await this.getRedriveChannel();
    await channel.checkQueue(target.dlqQueue);
    await channel.checkExchange(target.retryExchange);

    const failures: Array<{ index: number; reason: string }> = [];
    let moved = 0;
    let fetched = 0;

    for (let index = 0; index < input.limit; index += 1) {
      const message = await channel.get(target.dlqQueue, { noAck: false });
      if (!message) {
        break;
      }

      fetched += 1;

      try {
        const published = channel.publish(
          target.retryExchange,
          target.retryRoutingKey,
          message.content,
          this.withRedriveHeaders(message.properties, {
            queue: target.dlqQueue,
            operationCorrelationId: input.operationCorrelationId,
            originalRoutingKey: message.fields.routingKey,
            requestedByUserId: input.requestedByUserId,
            requestedByUserName: input.requestedByUserName,
          }),
        );

        if (!published) {
          await once(channel, 'drain');
        }

        await channel.waitForConfirms();
        channel.ack(message);
        moved += 1;

        const summary = summarizeEnvelope(message.content);
        this.logger.log(JSON.stringify(createJsonLogEntry({
          level: 'info',
          service: 'api-gateway',
          message: 'DLQ message re-driven via AMQP confirm channel.',
          correlationId: input.operationCorrelationId,
          queue: target.dlqQueue,
          metadata: {
            index,
            retryExchange: target.retryExchange,
            retryRoutingKey: target.retryRoutingKey,
            originalMessageId: summary.messageId ?? message.properties.messageId,
            originalType: summary.type ?? message.properties.type,
            originalCorrelationId: summary.correlationId ?? message.properties.correlationId,
          },
        })));
      } catch (error) {
        channel.nack(message, false, true);
        const reason = error instanceof Error ? error.message : 'Unknown publish error.';
        failures.push({ index, reason });

        this.logger.error(JSON.stringify(createJsonLogEntry({
          level: 'error',
          service: 'api-gateway',
          message: 'DLQ re-drive publish failed; message requeued in DLQ.',
          correlationId: input.operationCorrelationId,
          queue: target.dlqQueue,
          metadata: {
            index,
            retryExchange: target.retryExchange,
          },
          error,
        })));

        break;
      }
    }

    const result: DlqRedriveResult = {
      operationCorrelationId: input.operationCorrelationId,
      queue: target.dlqQueue,
      mainQueue: target.mainQueue,
      retryExchange: target.retryExchange,
      requested: input.limit,
      fetched,
      moved,
      failed: failures.length,
      failures,
      caveat:
        'Safe mode: re-drive uses AMQP confirm channel and only acks the DLQ message after publish confirmation.',
    };

    await this.publishRedriveCompletedEvent(result, {
      requestedByUserId: input.requestedByUserId,
      requestedByUserName: input.requestedByUserName,
    });

    return result;
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeRedriveChannel();
  }

  private async publishRedriveCompletedEvent(
    result: DlqRedriveResult,
    metadata: { requestedByUserId: string; requestedByUserName: string },
  ): Promise<void> {
    const channel = await this.getRedriveChannel();

    const payload: DlqRedriveCompletedEventPayload = {
      operationCorrelationId: result.operationCorrelationId,
      queue: result.queue,
      mainQueue: result.mainQueue,
      retryExchange: result.retryExchange,
      requested: result.requested,
      fetched: result.fetched,
      moved: result.moved,
      failed: result.failed,
      requestedByUserId: metadata.requestedByUserId,
      requestedByUserName: metadata.requestedByUserName,
      failures: result.failures.slice(0, 10),
    };

    const event = createEnvelope({
      messageId: generateId(),
      kind: 'event',
      type: DLQ_REDRIVE_COMPLETED_EVENT_TYPE,
      producer: 'api-gateway',
      correlationId: result.operationCorrelationId,
      payload,
      version: 1,
    });

    const published = channel.publish(
      this.config.rabbitmqEventsExchange,
      DLQ_REDRIVE_COMPLETED_ROUTING_KEY,
      Buffer.from(JSON.stringify(event), 'utf-8'),
      {
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        deliveryMode: 2,
        timestamp: Date.now(),
        messageId: event.messageId,
        type: event.type,
        correlationId: event.correlationId,
        headers: {
          kind: event.kind,
          version: event.version,
          producer: event.producer,
        },
      },
    );

    if (!published) {
      await once(channel, 'drain');
    }

    await channel.waitForConfirms();
  }

  private async getRedriveChannel(): Promise<amqp.ConfirmChannel> {
    if (this.redriveChannel) {
      return this.redriveChannel;
    }

    if (!this.redriveChannelPromise) {
      this.redriveChannelPromise = this.createRedriveChannel();
    }

    try {
      return await this.redriveChannelPromise;
    } finally {
      this.redriveChannelPromise = undefined;
    }
  }

  private async createRedriveChannel(): Promise<amqp.ConfirmChannel> {
    const connection = await amqp.connect(this.config.rabbitmqUrl);
    const channel = await connection.createConfirmChannel();

    connection.on('error', (error: unknown) => {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'api-gateway',
        message: 'AMQP connection error for DLQ re-drive adapter.',
        correlationId: 'system',
        error,
      })));
      this.resetRedriveChannelState();
    });

    connection.on('close', () => {
      this.logger.warn(JSON.stringify(createJsonLogEntry({
        level: 'warn',
        service: 'api-gateway',
        message: 'AMQP connection closed for DLQ re-drive adapter.',
        correlationId: 'system',
      })));
      this.resetRedriveChannelState();
    });

    channel.on('error', (error: unknown) => {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'api-gateway',
        message: 'AMQP channel error for DLQ re-drive adapter.',
        correlationId: 'system',
        error,
      })));
      this.resetRedriveChannelState();
    });

    channel.on('close', () => {
      this.logger.warn(JSON.stringify(createJsonLogEntry({
        level: 'warn',
        service: 'api-gateway',
        message: 'AMQP channel closed for DLQ re-drive adapter.',
        correlationId: 'system',
      })));
      this.resetRedriveChannelState();
    });

    await channel.assertExchange(this.config.rabbitmqEventsExchange, 'topic', { durable: true });

    this.redriveConnection = connection;
    this.redriveChannel = channel;

    return channel;
  }

  private resetRedriveChannelState(): void {
    this.redriveChannel = undefined;
    this.redriveConnection = undefined;
  }

  private async closeRedriveChannel(): Promise<void> {
    const channel = this.redriveChannel;
    const connection = this.redriveConnection;
    this.resetRedriveChannelState();

    try {
      if (channel) {
        await channel.close();
      }
    } catch {
      // no-op during shutdown
    }

    try {
      if (connection) {
        await connection.close();
      }
    } catch {
      // no-op during shutdown
    }
  }

  private async readFromQueue(
    queueName: string,
    count: number,
    ackmode: 'ack_requeue_true' | 'ack_requeue_false',
  ): Promise<RabbitQueueGetMessageDto[]> {
    return this.requestJson<RabbitQueueGetMessageDto[]>(
      'POST',
      this.path(`/queues/${this.encodedVhost}/${encodeURIComponent(queueName)}/get`),
      {
        count,
        ackmode,
        encoding: 'auto',
        truncate: 65535,
      },
    );
  }

  private toPeekMessage(message: RabbitQueueGetMessageDto): DlqPeekMessage {
    return {
      messageCountHint:
        typeof message.message_count === 'number' ? message.message_count : undefined,
      redelivered: Boolean(message.redelivered),
      exchange: typeof message.exchange === 'string' ? message.exchange : undefined,
      routingKey: typeof message.routing_key === 'string' ? message.routing_key : undefined,
      payload: safeParseJsonPayload(message.payload),
      payloadEncoding: typeof message.payload_encoding === 'string' ? message.payload_encoding : 'unknown',
      properties: isRecord(message.properties) ? message.properties : {},
    };
  }

  private withRedriveHeaders(
    properties: amqp.MessageProperties,
    metadata: {
      queue: string;
      operationCorrelationId: string;
      originalRoutingKey?: string;
      requestedByUserId: string;
      requestedByUserName: string;
    },
  ): amqp.Options.Publish {
    const headers = isRecord(properties.headers) ? { ...properties.headers } : {};

    headers['x-redriven-from-dlq'] = metadata.queue;
    headers['x-redriven-at'] = new Date().toISOString();
    headers['x-redriven-by-user-id'] = metadata.requestedByUserId;
    headers['x-redriven-by-user-name'] = metadata.requestedByUserName;
    headers['x-redrive-operation-correlation-id'] = metadata.operationCorrelationId;

    if (metadata.originalRoutingKey) {
      headers['x-original-routing-key'] = metadata.originalRoutingKey;
    }

    return {
      appId: properties.appId,
      contentEncoding: properties.contentEncoding,
      contentType: properties.contentType,
      correlationId: properties.correlationId,
      deliveryMode: properties.deliveryMode,
      expiration: properties.expiration,
      headers,
      messageId: properties.messageId,
      priority: properties.priority,
      replyTo: properties.replyTo,
      timestamp: properties.timestamp,
      type: properties.type,
      userId: properties.userId,
    };
  }

  private async requestJson<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.rabbitmqManagementTimeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.config.rabbitmqManagementApiBaseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          authorization: this.basicAuthHeader,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      throw new ServiceUnavailableException(`RabbitMQ Management API request failed (${message}).`);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `RabbitMQ Management API request failed (${response.status})${text ? `: ${truncate(text, 300)}` : '.'}`,
      );
    }

    return (await response.json()) as T;
  }

  private path(pathname: string): string {
    return pathname.startsWith('/') ? pathname : `/${pathname}`;
  }

  private get encodedVhost(): string {
    return encodeURIComponent(this.config.rabbitmqVhost);
  }

  private get basicAuthHeader(): string {
    const token = Buffer.from(
      `${this.config.rabbitmqManagementUser}:${this.config.rabbitmqManagementPassword}`,
      'utf8',
    ).toString('base64');
    return `Basic ${token}`;
  }
}

function summarizeEnvelope(rawContent: Buffer): ParsedEnvelopeSummary {
  try {
    const parsed = JSON.parse(rawContent.toString('utf-8')) as Record<string, unknown>;
    return {
      messageId: typeof parsed.messageId === 'string' ? parsed.messageId : undefined,
      type: typeof parsed.type === 'string' ? parsed.type : undefined,
      correlationId: typeof parsed.correlationId === 'string' ? parsed.correlationId : undefined,
    };
  } catch {
    return {};
  }
}

function safeParseJsonPayload(payload: unknown): unknown {
  if (typeof payload !== 'string') {
    return payload;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`;
}
