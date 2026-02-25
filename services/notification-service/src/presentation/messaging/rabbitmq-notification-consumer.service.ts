import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as amqp from 'amqplib';
import {
  applyRabbitMqRetryPolicy,
  createRabbitMqConsumerJsonLogLine,
} from '@event-pipeline/shared';
import { HandleNotificationEventUseCase } from '../../application/notification/handle-notification-event.use-case';
import { isNotifiableEvent } from '../../domain/notification/notifiable-event';
import { NotificationServiceConfigService } from '../../infrastructure/config/notification-service-config.service';

@Injectable()
export class RabbitMqNotificationConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqNotificationConsumerService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private consumerTag?: string;

  constructor(
    private readonly handleNotificationEventUseCase: HandleNotificationEventUseCase,
    private readonly config: NotificationServiceConfigService,
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
      this.logger.warn('AMQP connection closed for notification consumer.');
    });
    channel.on('error', (error: unknown) => {
      this.logger.error(
        `AMQP channel error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    channel.on('close', () => {
      this.logger.warn('AMQP channel closed for notification consumer.');
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
    this.logger.log(`Consuming notification messages from queue "${queue}" with prefetch=${prefetch}.`);
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
        service: 'notification-service',
        message: decision.action === 'parked' ? 'Invalid notification JSON parked in DLQ after retry limit.' : 'Invalid notification JSON rejected for retry.',
        queue,
        amqpMessage: message,
        error,
        metadata: { retryAction: decision.action, deliveryAttempt: decision.deliveryAttempt, maxDeliveryAttempts: decision.maxDeliveryAttempts },
      }));
      return;
    }

    if (!isNotifiableEvent(parsed)) {
      const type =
        typeof (parsed as Record<string, unknown>)?.type === 'string'
          ? (parsed as Record<string, unknown>).type
          : 'unknown';

      // Notification queue may receive future processing events. Ignore unsupported ones.
      this.logger.debug(createRabbitMqConsumerJsonLogLine({
        level: 'debug',
        service: 'notification-service',
        message: `Ignoring unsupported notification event type=${type}.`,
        queue,
        amqpMessage: message,
        envelope: parsed,
      }));
      channel.ack(message);
      return;
    }

    try {
      await this.handleNotificationEventUseCase.execute({
        event: parsed,
        routingKey: message.fields.routingKey,
      });
      channel.ack(message);
    } catch (error) {
      const decision = applyRabbitMqRetryPolicy({ channel, message, queue, parkingReason: 'notification-error' });
      this.logger.error(createRabbitMqConsumerJsonLogLine({
        level: 'error',
        service: 'notification-service',
        message: decision.action === 'parked'
          ? `Failed to process notification event ${parsed.type}; parked in DLQ after retry limit.`
          : `Failed to process notification event ${parsed.type}; sent to retry.`,
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
