import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
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

interface RabbitPublishResponseDto {
  routed?: boolean;
}

@Injectable()
export class RabbitMqManagementDlqAdminAdapter implements DlqAdminPort {
  private readonly logger = new Logger(RabbitMqManagementDlqAdminAdapter.name);

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

    const pulled = await this.readFromQueue(target.dlqQueue, input.limit, 'ack_requeue_false');
    const failures: Array<{ index: number; reason: string }> = [];
    let moved = 0;

    for (let index = 0; index < pulled.length; index += 1) {
      const message = pulled[index];
      try {
        const routed = await this.publishToExchange({
          exchange: target.retryExchange,
          routingKey: target.retryRoutingKey,
          payload: message.payload,
          payloadEncoding: message.payload_encoding ?? 'auto',
          properties: this.withRedriveHeaders(message.properties, {
            queue: target.dlqQueue,
            originalRoutingKey: message.routing_key,
            requestedByUserId: input.requestedByUserId,
            requestedByUserName: input.requestedByUserName,
          }),
        });

        if (!routed) {
          failures.push({ index, reason: 'RabbitMQ Management API publish returned routed=false.' });
          continue;
        }

        moved += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown publish error.';
        failures.push({ index, reason });
        this.logger.error(JSON.stringify(createJsonLogEntry({
          level: 'error',
          service: 'api-gateway',
          message: 'DLQ re-drive publish failed.',
          correlationId: 'system',
          queue: target.dlqQueue,
          metadata: {
            index,
            retryExchange: target.retryExchange,
          },
          error,
        })));
      }
    }

    return {
      queue: target.dlqQueue,
      mainQueue: target.mainQueue,
      retryExchange: target.retryExchange,
      requested: input.limit,
      fetched: pulled.length,
      moved,
      failed: failures.length,
      failures,
      caveat:
        'Re-drive uses RabbitMQ Management API queue/get with ack_requeue_false. If republish fails after dequeue, the message may require manual recovery from logs/audit.',
    };
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

  private async publishToExchange(input: {
    exchange: string;
    routingKey: string;
    payload: unknown;
    payloadEncoding: string;
    properties: Record<string, unknown>;
  }): Promise<boolean> {
    const response = await this.requestJson<RabbitPublishResponseDto>(
      'POST',
      this.path(`/exchanges/${this.encodedVhost}/${encodeURIComponent(input.exchange)}/publish`),
      {
        properties: input.properties,
        routing_key: input.routingKey,
        payload: typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload ?? null),
        payload_encoding: input.payloadEncoding === 'base64' ? 'base64' : 'string',
      },
    );

    return Boolean(response.routed);
  }

  private withRedriveHeaders(
    properties: Record<string, unknown> | undefined,
    metadata: {
      queue: string;
      originalRoutingKey?: string;
      requestedByUserId: string;
      requestedByUserName: string;
    },
  ): Record<string, unknown> {
    const nextProperties = isRecord(properties) ? { ...properties } : {};
    const headers = isRecord(nextProperties.headers) ? { ...nextProperties.headers } : {};

    headers['x-redriven-from-dlq'] = metadata.queue;
    headers['x-redriven-at'] = new Date().toISOString();
    headers['x-redriven-by-user-id'] = metadata.requestedByUserId;
    headers['x-redriven-by-user-name'] = metadata.requestedByUserName;

    if (metadata.originalRoutingKey) {
      headers['x-original-routing-key'] = metadata.originalRoutingKey;
    }

    nextProperties.headers = headers;
    return nextProperties;
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
