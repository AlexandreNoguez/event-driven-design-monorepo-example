import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { once } from 'node:events';
import * as amqp from 'amqplib';

export interface CommandEnvelopeLike {
  messageId: string;
  type: string;
  correlationId: string;
  causationId?: string;
  producer: string;
  version: number;
  kind: 'command';
  payload: unknown;
  occurredAt: string;
}

@Injectable()
export class RabbitMqPublisherService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqPublisherService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private channelPromise?: Promise<amqp.ConfirmChannel>;
  private readonly amqpUrl = process.env.RABBITMQ_URL ?? 'amqp://event:event@localhost:5672';
  private readonly commandsExchange = process.env.RABBITMQ_EXCHANGE_COMMANDS ?? 'domain.commands';

  async publishCommand(envelope: CommandEnvelopeLike, routingKey: string): Promise<void> {
    const channel = await this.getChannel();
    const payload = Buffer.from(JSON.stringify(envelope));

    const published = channel.publish(this.commandsExchange, routingKey, payload, {
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
      const channel = await this.channelPromise;
      return channel;
    } finally {
      this.channelPromise = undefined;
    }
  }

  private async createChannel(): Promise<amqp.ConfirmChannel> {
    const connection = await amqp.connect(this.amqpUrl);
    const channel = await connection.createConfirmChannel();

    connection.on('error', (error) => {
      this.logger.error(
        `AMQP connection error: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.resetChannelState();
    });

    connection.on('close', () => {
      this.logger.warn('AMQP connection closed.');
      this.resetChannelState();
    });

    channel.on('error', (error) => {
      this.logger.error(`AMQP channel error: ${error instanceof Error ? error.message : String(error)}`);
      this.resetChannelState();
    });

    channel.on('close', () => {
      this.logger.warn('AMQP channel closed.');
      this.resetChannelState();
    });

    await channel.assertExchange(this.commandsExchange, 'topic', { durable: true });

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
