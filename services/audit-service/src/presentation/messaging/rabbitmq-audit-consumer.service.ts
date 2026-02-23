import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import { RecordAuditableEventUseCase } from '../../application/audit/record-auditable-event.use-case';
import { isAuditableEvent } from '../../domain/audit/auditable-event';

@Injectable()
export class RabbitMqAuditConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqAuditConsumerService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private consumerTag?: string;

  constructor(private readonly recordAuditableEventUseCase: RecordAuditableEventUseCase) {}

  async onModuleInit(): Promise<void> {
    await this.startConsumer();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopConsumer();
  }

  private async startConsumer(): Promise<void> {
    const amqpUrl = process.env.RABBITMQ_URL ?? 'amqp://event:event@localhost:5672';
    const queue = process.env.AUDIT_SERVICE_QUEUE ?? 'q.audit';
    const prefetch = parsePositiveInt(process.env.AUDIT_SERVICE_PREFETCH, 100);

    const connection = await amqp.connect(amqpUrl);
    const channel = await connection.createChannel();

    connection.on('error', (error: unknown) => {
      this.logger.error(
        `AMQP connection error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    connection.on('close', () => {
      this.logger.warn('AMQP connection closed for audit consumer.');
    });
    channel.on('error', (error: unknown) => {
      this.logger.error(
        `AMQP channel error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    channel.on('close', () => {
      this.logger.warn('AMQP channel closed for audit consumer.');
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
    this.logger.log(`Consuming audit messages from queue "${queue}" with prefetch=${prefetch}.`);
  }

  private async handleMessage(channel: amqp.Channel, message: amqp.ConsumeMessage): Promise<void> {
    let parsed: unknown;

    try {
      parsed = JSON.parse(message.content.toString('utf-8'));
    } catch (error) {
      this.logger.error(
        `Invalid JSON in audit message. ${error instanceof Error ? error.message : String(error)}`,
      );
      channel.nack(message, false, false);
      return;
    }

    if (!isAuditableEvent(parsed)) {
      const type =
        typeof (parsed as Record<string, unknown>)?.type === 'string'
          ? (parsed as Record<string, unknown>).type
          : 'unknown';

      // q.audit is intended for events; ignore unsupported messages rather than retrying.
      this.logger.debug(`Ignoring unsupported audit message type=${type}.`);
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
      this.logger.error(
        `Failed to audit event ${parsed.type}: ${error instanceof Error ? error.message : String(error)}`,
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

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
