import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { HandleUploadRequestedUseCase } from '../../application/uploads/handle-upload-requested.use-case';
import type { UploadRequestedCommandEnvelope } from '../../domain/uploads/upload-message.types';
import { UploadServiceConfigService } from '../../infrastructure/config/upload-service-config.service';

@Injectable()
export class RabbitMqCommandConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqCommandConsumerService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private consumerTag?: string;

  constructor(
    private readonly handleUploadRequestedUseCase: HandleUploadRequestedUseCase,
    private readonly config: UploadServiceConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.startConsumer();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopConsumer();
  }

  private async startConsumer(): Promise<void> {
    const amqpUrl = this.config.rabbitmqUrl;
    const queue = this.config.commandQueue;
    const prefetch = this.config.commandPrefetch;

    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    connection.on('error', (error) => {
      this.logger.error(
        `AMQP connection error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    connection.on('close', () => {
      this.logger.warn('AMQP connection closed for upload command consumer.');
    });
    channel.on('error', (error) => {
      this.logger.error(
        `AMQP channel error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    channel.on('close', () => {
      this.logger.warn('AMQP channel closed for upload command consumer.');
    });

    await channel.checkQueue(queue);
    await channel.prefetch(prefetch);

    const consumed = await channel.consume(queue, async (message) => {
      if (!message) {
        return;
      }
      await this.handleMessage(channel, message);
    });

    this.connection = connection;
    this.channel = channel;
    this.consumerTag = consumed.consumerTag;
    this.logger.log(`Consuming upload commands from queue "${queue}" with prefetch=${prefetch}.`);
  }

  private async handleMessage(channel: amqp.Channel, message: amqp.ConsumeMessage): Promise<void> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(message.content.toString('utf-8'));
    } catch (error) {
      this.logger.error(
        `Invalid JSON in command message. ${error instanceof Error ? error.message : String(error)}`,
      );
      channel.nack(message, false, false);
      return;
    }

    if (!isUploadRequestedCommandEnvelope(parsed)) {
      const messageType =
        typeof (parsed as Record<string, unknown>)?.type === 'string'
          ? (parsed as Record<string, unknown>).type
          : 'unknown';

      this.logger.warn(
        `Unsupported command received on q.upload.commands (type=${messageType}). Sending to retry/DLQ.`,
      );
      channel.nack(message, false, false);
      return;
    }

    try {
      await this.handleUploadRequestedUseCase.execute(parsed);
      channel.ack(message);
    } catch (error) {
      this.logger.error(
        `Failed to process UploadRequested.v1: ${error instanceof Error ? error.message : String(error)}`,
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

function isUploadRequestedCommandEnvelope(value: unknown): value is UploadRequestedCommandEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== 'command' ||
    candidate.type !== 'UploadRequested.v1' ||
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
    typeof payload.fileName === 'string' &&
    typeof payload.contentType === 'string' &&
    typeof payload.sizeBytes === 'number'
  );
}
