import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { once } from 'node:events';
import * as amqp from 'amqplib';
import type { UploadEventsPublisherPort } from '../../application/uploads/ports/events-publisher.port';
import type { FileUploadedEventEnvelope } from '../../domain/uploads/upload-message.types';

@Injectable()
export class RabbitMqUploadEventsPublisherAdapter implements UploadEventsPublisherPort, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqUploadEventsPublisherAdapter.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private channelPromise?: Promise<amqp.ConfirmChannel>;

  async publishFileUploaded(
    envelope: FileUploadedEventEnvelope,
    routingKey = 'files.uploaded.v1',
  ): Promise<void> {
    const exchange = process.env.RABBITMQ_EXCHANGE_EVENTS ?? 'domain.events';
    const channel = await this.getChannel(exchange);
    const payload = Buffer.from(JSON.stringify(envelope));

    const published = channel.publish(exchange, routingKey, payload, {
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      deliveryMode: 2,
      timestamp: Date.now(),
      messageId: envelope.messageId,
      type: envelope.type,
      correlationId: envelope.correlationId,
      headers: {
        kind: envelope.kind,
        producer: envelope.producer,
        version: envelope.version,
        causationId: envelope.causationId ?? '',
      },
    });

    if (!published) {
      await once(channel, 'drain');
    }

    await channel.waitForConfirms();
  }

  async onModuleDestroy(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.channel = undefined;
    this.connection = undefined;

    try {
      if (channel) {
        await channel.close();
      }
    } catch {
      // ignore on shutdown
    }

    try {
      if (connection) {
        await connection.close();
      }
    } catch {
      // ignore on shutdown
    }
  }

  private async getChannel(exchange: string): Promise<amqp.ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }

    if (!this.channelPromise) {
      this.channelPromise = this.createChannel(exchange);
    }

    try {
      return await this.channelPromise;
    } finally {
      this.channelPromise = undefined;
    }
  }

  private async createChannel(exchange: string): Promise<amqp.ConfirmChannel> {
    const amqpUrl = process.env.RABBITMQ_URL ?? 'amqp://event:event@localhost:5672';
    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createConfirmChannel();

    connection.on('error', (error) => {
      this.logger.error(
        `AMQP connection error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.connection = undefined;
      this.channel = undefined;
    });
    connection.on('close', () => {
      this.logger.warn('AMQP connection closed for outbox publisher.');
      this.connection = undefined;
      this.channel = undefined;
    });

    channel.on('error', (error) => {
      this.logger.error(
        `AMQP channel error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.channel = undefined;
    });
    channel.on('close', () => {
      this.logger.warn('AMQP channel closed for outbox publisher.');
      this.channel = undefined;
    });

    await channel.assertExchange(exchange, 'topic', { durable: true });

    this.connection = connection;
    this.channel = channel;
    return channel;
  }
}
