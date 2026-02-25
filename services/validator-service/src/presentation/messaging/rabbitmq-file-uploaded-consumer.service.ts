import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import {
  applyRabbitMqRetryPolicy,
  createRabbitMqConsumerJsonLogLine,
  type DomainEventV1,
} from '@event-pipeline/shared';
import { HandleFileUploadedUseCase } from '../../application/validation/handle-file-uploaded.use-case';
import { ValidatorServiceConfigService } from '../../infrastructure/config/validator-service-config.service';

@Injectable()
export class RabbitMqFileUploadedConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqFileUploadedConsumerService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private consumerTag?: string;

  constructor(
    private readonly handleFileUploadedUseCase: HandleFileUploadedUseCase,
    private readonly config: ValidatorServiceConfigService,
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
      this.logger.error(
        `AMQP connection error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    connection.on('close', () => {
      this.logger.warn('AMQP connection closed for validator consumer.');
    });
    channel.on('error', (error: unknown) => {
      this.logger.error(
        `AMQP channel error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    channel.on('close', () => {
      this.logger.warn('AMQP channel closed for validator consumer.');
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
    this.logger.log(`Consuming validator messages from queue "${queue}" with prefetch=${prefetch}.`);
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
        service: 'validator-service',
        message: decision.action === 'parked'
          ? 'Invalid JSON parked in DLQ after retry limit.'
          : 'Invalid JSON rejected for retry.',
        queue,
        amqpMessage: message,
        error,
        metadata: {
          retryAction: decision.action,
          deliveryAttempt: decision.deliveryAttempt,
          maxDeliveryAttempts: decision.maxDeliveryAttempts,
          dlqExchange: decision.dlqExchange,
        },
      }));
      return;
    }

    if (!isFileUploadedEvent(parsed)) {
      const type = typeof (parsed as Record<string, unknown>)?.type === 'string'
        ? (parsed as Record<string, unknown>).type
        : 'unknown';
      const decision = applyRabbitMqRetryPolicy({
        channel,
        message,
        queue,
        parkingReason: 'unsupported-event-type',
      });
      this.logger.warn(createRabbitMqConsumerJsonLogLine({
        level: 'warn',
        service: 'validator-service',
        message: decision.action === 'parked'
          ? `Unsupported event type parked in DLQ (${type}).`
          : `Unsupported event type sent to retry (${type}).`,
        queue,
        amqpMessage: message,
        envelope: parsed,
        metadata: {
          retryAction: decision.action,
          deliveryAttempt: decision.deliveryAttempt,
          maxDeliveryAttempts: decision.maxDeliveryAttempts,
        },
      }));
      return;
    }

    try {
      await this.handleFileUploadedUseCase.execute(parsed);
      channel.ack(message);
    } catch (error) {
      const decision = applyRabbitMqRetryPolicy({
        channel,
        message,
        queue,
        parkingReason: 'processing-error',
      });
      this.logger.error(createRabbitMqConsumerJsonLogLine({
        level: 'error',
        service: 'validator-service',
        message: decision.action === 'parked'
          ? 'Failed to process FileUploaded.v1; parked in DLQ after retry limit.'
          : 'Failed to process FileUploaded.v1; sent to retry.',
        queue,
        amqpMessage: message,
        envelope: parsed,
        error,
        metadata: {
          retryAction: decision.action,
          deliveryAttempt: decision.deliveryAttempt,
          maxDeliveryAttempts: decision.maxDeliveryAttempts,
        },
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

function isFileUploadedEvent(value: unknown): value is DomainEventV1<'FileUploaded.v1'> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== 'event' ||
    candidate.type !== 'FileUploaded.v1' ||
    typeof candidate.messageId !== 'string' ||
    typeof candidate.correlationId !== 'string' ||
    typeof candidate.producer !== 'string'
  ) {
    return false;
  }

  if (!candidate.payload || typeof candidate.payload !== 'object') {
    return false;
  }

  const payload = candidate.payload as Record<string, unknown>;
  return (
    typeof payload.fileId === 'string' &&
    typeof payload.bucket === 'string' &&
    typeof payload.objectKey === 'string' &&
    typeof payload.contentType === 'string' &&
    typeof payload.sizeBytes === 'number'
  );
}
