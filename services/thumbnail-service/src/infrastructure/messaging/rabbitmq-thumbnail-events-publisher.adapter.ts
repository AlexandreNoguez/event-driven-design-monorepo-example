import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { once } from 'node:events';
import * as amqp from 'amqplib';
import { createJsonLogEntry, type DomainEventV1 } from '@event-pipeline/shared';
import type { ThumbnailEventsPublisherPort } from '../../application/thumbnail/ports/thumbnail-events-publisher.port';
import { ThumbnailServiceConfigService } from '../config/thumbnail-service-config.service';

@Injectable()
export class RabbitMqThumbnailEventsPublisherAdapter
  implements ThumbnailEventsPublisherPort, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqThumbnailEventsPublisherAdapter.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private channelPromise?: Promise<amqp.ConfirmChannel>;

  constructor(private readonly config: ThumbnailServiceConfigService) {}

  async publishDomainEvent(event: DomainEventV1, routingKey: string): Promise<void> {
    const exchange = this.config.rabbitmqEventsExchange;
    const channel = await this.getChannel(exchange);
    const payload = Buffer.from(JSON.stringify(event));

    const published = channel.publish(exchange, routingKey, payload, {
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      deliveryMode: 2,
      timestamp: Date.now(),
      messageId: event.messageId,
      type: event.type,
      correlationId: event.correlationId,
      headers: {
        kind: event.kind,
        producer: event.producer,
        version: event.version,
        causationId: event.causationId ?? '',
      },
    });

    if (!published) {
      await once(channel, 'drain');
    }

    await channel.waitForConfirms();
    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'thumbnail-service',
      message: 'Domain event published to RabbitMQ.',
      correlationId: event.correlationId,
      causationId: event.causationId,
      messageId: event.messageId,
      messageType: event.type,
      routingKey,
      fileId: typeof (event.payload as { fileId?: unknown })?.fileId === 'string'
        ? (event.payload as { fileId?: string }).fileId
        : undefined,
      userId: typeof (event.payload as { userId?: unknown })?.userId === 'string'
        ? (event.payload as { userId?: string }).userId
        : undefined,
    })));
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
    const connection = await amqp.connect(this.config.rabbitmqUrl);
    const channel = await connection.createConfirmChannel();

    connection.on('error', (error: unknown) => {
      this.logger.error(
        `AMQP connection error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.connection = undefined;
      this.channel = undefined;
    });
    connection.on('close', () => {
      this.logger.warn('AMQP connection closed for thumbnail publisher.');
      this.connection = undefined;
      this.channel = undefined;
    });

    channel.on('error', (error: unknown) => {
      this.logger.error(
        `AMQP channel error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.channel = undefined;
    });
    channel.on('close', () => {
      this.logger.warn('AMQP channel closed for thumbnail publisher.');
      this.channel = undefined;
    });

    await channel.assertExchange(exchange, 'topic', { durable: true });

    this.connection = connection;
    this.channel = channel;
    return channel;
  }
}
