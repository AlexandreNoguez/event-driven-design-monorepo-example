import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { once } from 'node:events';
import * as amqp from 'amqplib';
import { createJsonLogEntry } from '@event-pipeline/shared';
import type {
  CommandEnvelopeLike,
  CommandPublisher,
} from '../../application/uploads/ports/command-publisher.port';
import { ApiGatewayConfigService } from '../config/api-gateway-config.service';

@Injectable()
export class RabbitMqCommandPublisherAdapter implements CommandPublisher, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqCommandPublisherAdapter.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private channelPromise?: Promise<amqp.ConfirmChannel>;

  constructor(private readonly config: ApiGatewayConfigService) {}

  async publishCommand(envelope: CommandEnvelopeLike, routingKey: string): Promise<void> {
    const channel = await this.getChannel();
    const payload = Buffer.from(JSON.stringify(envelope));

    const published = channel.publish(this.config.rabbitmqCommandsExchange, routingKey, payload, {
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      deliveryMode: 2,
      timestamp: Date.now(),
      messageId: envelope.messageId,
      type: envelope.type,
      correlationId: envelope.correlationId,
      headers: {
        kind: envelope.kind,
        version: envelope.version,
        producer: envelope.producer,
        causationId: envelope.causationId ?? '',
      },
    });

    if (!published) {
      await once(channel, 'drain');
    }

    await channel.waitForConfirms();
    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'api-gateway',
      message: 'Command published to RabbitMQ.',
      correlationId: envelope.correlationId,
      causationId: envelope.causationId,
      messageId: envelope.messageId,
      messageType: envelope.type,
      routingKey,
      fileId: tryReadPayloadString(envelope.payload, 'fileId'),
      userId: tryReadPayloadString(envelope.payload, 'userId'),
    })));
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeChannelAndConnection();
  }

  private async getChannel(): Promise<amqp.ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }

    if (!this.channelPromise) {
      this.channelPromise = this.createChannel();
    }

    try {
      return await this.channelPromise;
    } finally {
      this.channelPromise = undefined;
    }
  }

  private async createChannel(): Promise<amqp.ConfirmChannel> {
    const connection = await amqp.connect(this.config.rabbitmqUrl);
    const channel = await connection.createConfirmChannel();

    connection.on('error', (error) => {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'api-gateway',
        message: 'AMQP command publisher connection error.',
        correlationId: 'system',
        error,
      })));
      this.resetChannelState();
    });

    connection.on('close', () => {
      this.logger.warn(JSON.stringify(createJsonLogEntry({
        level: 'warn',
        service: 'api-gateway',
        message: 'AMQP command publisher connection closed.',
        correlationId: 'system',
      })));
      this.resetChannelState();
    });

    channel.on('error', (error) => {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'api-gateway',
        message: 'AMQP command publisher channel error.',
        correlationId: 'system',
        error,
      })));
      this.resetChannelState();
    });

    channel.on('close', () => {
      this.logger.warn(JSON.stringify(createJsonLogEntry({
        level: 'warn',
        service: 'api-gateway',
        message: 'AMQP command publisher channel closed.',
        correlationId: 'system',
      })));
      this.resetChannelState();
    });

    await channel.assertExchange(this.config.rabbitmqCommandsExchange, 'topic', { durable: true });

    this.connection = connection;
    this.channel = channel;
    return channel;
  }

  private resetChannelState(): void {
    this.channel = undefined;
    this.connection = undefined;
  }

  private async closeChannelAndConnection(): Promise<void> {
    const channel = this.channel;
    const connection = this.connection;
    this.resetChannelState();

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
}

function tryReadPayloadString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record[key] === 'string' ? (record[key] as string) : undefined;
}
