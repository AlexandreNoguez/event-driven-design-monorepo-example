import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  buildNotificationTemplate,
  resolveRecipientForEvent,
  type NotifiableEventWithRoutingKey,
} from '../../domain/notification/notifiable-event';
import {
  NOTIFICATION_MAILER_PORT,
  type NotificationMailerPort,
} from './ports/notification-mailer.port';
import {
  NOTIFICATION_REPOSITORY_PORT,
  type NotificationRepositoryPort,
} from './ports/notification-repository.port';
import { NotificationServiceConfigService } from '../../infrastructure/config/notification-service-config.service';

@Injectable()
export class HandleNotificationEventUseCase {
  private readonly logger = new Logger(HandleNotificationEventUseCase.name);

  constructor(
    @Inject(NOTIFICATION_REPOSITORY_PORT)
    private readonly repository: NotificationRepositoryPort,
    @Inject(NOTIFICATION_MAILER_PORT)
    private readonly mailer: NotificationMailerPort,
    private readonly config: NotificationServiceConfigService,
  ) {}

  async execute(input: NotifiableEventWithRoutingKey): Promise<{ skipped: boolean; sent: boolean }> {
    const consumerName = this.config.consumerName;
    const event = input.event;

    if (await this.repository.hasProcessedEvent(event.messageId, consumerName)) {
      this.logger.log(`Skipping already processed notification event ${event.messageId} (${consumerName}).`);
      return { skipped: true, sent: false };
    }

    const template = buildNotificationTemplate(event);
    const recipient = resolveRecipientForEvent(event, {
      fallbackRecipient: this.config.fallbackRecipient,
      defaultRecipientDomain: this.config.defaultRecipientDomain,
    });

    const attempt = await this.repository.recordNotificationAttempt({
      eventId: event.messageId,
      eventType: event.type,
      fileId: event.payload.fileId,
      recipient,
      templateKey: template.templateKey,
      correlationId: event.correlationId,
    });

    if (attempt.status === 'sent') {
      await this.repository.markProcessedEvent({
        eventId: event.messageId,
        consumerName,
        correlationId: event.correlationId,
        messageType: event.type,
        sourceProducer: event.producer,
      });

      this.logger.log(
        `Notification for ${event.type} (${event.messageId}) was already sent previously. Marked as processed.`,
      );
      return { skipped: true, sent: false };
    }

    try {
      const sendResult = await this.mailer.sendEmail({
        to: recipient,
        subject: template.subject,
        text: template.text,
        headers: {
          'x-event-id': event.messageId,
          'x-event-type': event.type,
          'x-correlation-id': event.correlationId,
          ...(input.routingKey ? { 'x-routing-key': input.routingKey } : {}),
        },
      });

      await this.repository.markNotificationSent(attempt.notificationId, sendResult.providerMessageId);
      await this.repository.markProcessedEvent({
        eventId: event.messageId,
        consumerName,
        correlationId: event.correlationId,
        messageType: event.type,
        sourceProducer: event.producer,
      });

      this.logger.log(`Notification sent for ${event.type} (${event.messageId}) to ${recipient}.`);
      return { skipped: false, sent: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.markNotificationFailed(attempt.notificationId, message);
      throw error;
    }
  }
}
