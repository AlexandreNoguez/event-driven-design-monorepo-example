import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import type { DomainEventV1 } from '@event-pipeline/shared';
import { HandleFileValidatedUseCase } from '../../application/extractor/handle-file-validated.use-case';
import { ExtractorServiceConfigService } from '../../infrastructure/config/extractor-service-config.service';

@Injectable()
export class RabbitMqFileValidatedConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqFileValidatedConsumerService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private consumerTag?: string;

  constructor(
    private readonly handleFileValidatedUseCase: HandleFileValidatedUseCase,
    private readonly config: ExtractorServiceConfigService,
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
      this.logger.warn('AMQP connection closed for extractor consumer.');
    });
    channel.on('error', (error: unknown) => {
      this.logger.error(
        `AMQP channel error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    channel.on('close', () => {
      this.logger.warn('AMQP channel closed for extractor consumer.');
    });

    await channel.assertQueue(queue, { durable: true });
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
    this.logger.log(`Consuming extractor messages from queue "${queue}" with prefetch=${prefetch}.`);
  }

  private async handleMessage(channel: amqp.Channel, message: amqp.ConsumeMessage): Promise<void> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(message.content.toString('utf-8'));
    } catch (error) {
      this.logger.error(
        `Invalid JSON in extractor message. ${error instanceof Error ? error.message : String(error)}`,
      );
      channel.nack(message, false, false);
      return;
    }

    if (!isFileValidatedEvent(parsed)) {
      const type =
        typeof (parsed as Record<string, unknown>)?.type === 'string'
          ? (parsed as Record<string, unknown>).type
          : 'unknown';
      this.logger.warn(`Unsupported event on extractor queue (type=${type}). Sending to retry/DLQ.`);
      channel.nack(message, false, false);
      return;
    }

    try {
      await this.handleFileValidatedUseCase.execute(parsed);
      channel.ack(message);
    } catch (error) {
      this.logger.error(
        `Failed to process FileValidated.v1: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      channel.nack(message, false, false);
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

function isFileValidatedEvent(value: unknown): value is DomainEventV1<'FileValidated.v1'> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== 'event' ||
    candidate.type !== 'FileValidated.v1' ||
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
