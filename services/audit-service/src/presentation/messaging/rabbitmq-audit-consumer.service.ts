import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import {
  applyRabbitMqRetryPolicy,
  createJsonLogEntry,
  createRabbitMqConsumerJsonLogLine,
} from '@event-pipeline/shared';
import { RecordAuditableEventUseCase } from '../../application/audit/record-auditable-event.use-case';
import { isAuditableEvent } from '../../domain/audit/auditable-event';
import { AuditServiceConfigService } from '../../infrastructure/config/audit-service-config.service';

@Injectable()
export class RabbitMqAuditConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqAuditConsumerService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private consumerTag?: string;

  constructor(
    private readonly recordAuditableEventUseCase: RecordAuditableEventUseCase,
    private readonly config: AuditServiceConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startConsumer();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopConsumer();
  }

  private async startConsumer(): Promise<void> {
    const amqpUrl = this.config.rabbitmqUrl;
    const queue = this.config.queue;
    const prefetch = this.config.prefetch;

    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    connection.on('error', (error: unknown) => {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'audit-service',
        message: 'AMQP connection error for audit consumer.',
        correlationId: 'system',
        queue,
        error,
      })));
    });
    connection.on('close', () => {
      this.logger.warn(JSON.stringify(createJsonLogEntry({
        level: 'warn',
        service: 'audit-service',
        message: 'AMQP connection closed for audit consumer.',
        correlationId: 'system',
        queue,
      })));
    });
    channel.on('error', (error: unknown) => {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'audit-service',
        message: 'AMQP channel error for audit consumer.',
        correlationId: 'system',
        queue,
        error,
      })));
    });
    channel.on('close', () => {
      this.logger.warn(JSON.stringify(createJsonLogEntry({
        level: 'warn',
        service: 'audit-service',
        message: 'AMQP channel closed for audit consumer.',
        correlationId: 'system',
        queue,
      })));
    });

    await channel.checkQueue(queue);
    await channel.prefetch(prefetch);

    const consumed = await channel.consume(queue, async (message: amqp.ConsumeMessage | null) => {
      if (!message) {
        return;
      }
      await this.handleMessage(channel, message);
    });

    this.connection = connection;
    this.channel = channel;
    this.consumerTag = consumed.consumerTag;
    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'audit-service',
      message: 'Audit consumer started.',
      correlationId: 'system',
      queue,
      metadata: { prefetch },
    })));
  }

  private async handleMessage(channel: amqp.Channel, message: amqp.ConsumeMessage): Promise<void> {
    const queue = this.config.queue;
    let parsed: unknown;

    try {
      parsed = JSON.parse(message.content.toString('utf-8'));
    } catch (error) {
      const decision = applyRabbitMqRetryPolicy({ channel, message, queue, parkingReason: 'invalid-json' });
      this.logger.error(createRabbitMqConsumerJsonLogLine({
        level: 'error',
        service: 'audit-service',
        message: decision.action === 'parked' ? 'Invalid audit JSON parked in DLQ after retry limit.' : 'Invalid audit JSON rejected for retry.',
        queue,
        amqpMessage: message,
        error,
        metadata: { retryAction: decision.action, deliveryAttempt: decision.deliveryAttempt, maxDeliveryAttempts: decision.maxDeliveryAttempts },
      }));
      return;
    }

    if (!isAuditableEvent(parsed)) {
      const type =
        typeof (parsed as Record<string, unknown>)?.type === 'string'
          ? (parsed as Record<string, unknown>).type
          : 'unknown';

      // q.audit is intended for events; ignore unsupported messages rather than retrying.
      this.logger.debug(createRabbitMqConsumerJsonLogLine({
        level: 'debug',
        service: 'audit-service',
        message: `Ignoring unsupported audit message type=${type}.`,
        queue,
        amqpMessage: message,
        envelope: parsed,
      }));
      channel.ack(message);
      return;
    }

    try {
      await this.recordAuditableEventUseCase.execute({
        event: parsed,
        routingKey: message.fields.routingKey,
      });
      channel.ack(message);
    } catch (error) {
      const decision = applyRabbitMqRetryPolicy({ channel, message, queue, parkingReason: 'audit-error' });
      this.logger.error(createRabbitMqConsumerJsonLogLine({
        level: 'error',
        service: 'audit-service',
        message: decision.action === 'parked'
          ? `Failed to audit event ${parsed.type}; parked in DLQ after retry limit.`
          : `Failed to audit event ${parsed.type}; sent to retry.`,
        queue,
        amqpMessage: message,
        envelope: parsed,
        error,
        metadata: { retryAction: decision.action, deliveryAttempt: decision.deliveryAttempt, maxDeliveryAttempts: decision.maxDeliveryAttempts },
      }));
    }
  }

  private async stopConsumer(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    const consumerTag = this.consumerTag;

    this.channel = undefined;
    this.connection = undefined;
    this.consumerTag = undefined;

    try {
      if (channel && consumerTag) {
        await channel.cancel(consumerTag);
      }
    } catch {
      // ignore shutdown errors
    }

    try {
      if (channel) {
        await channel.close();
      }
    } catch {
      // ignore shutdown errors
    }

    try {
      if (connection) {
        await connection.close();
      }
    } catch {
      // ignore shutdown errors
    }
  }
}
