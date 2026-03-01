import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
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
      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'notification-service',
        message: 'Skipped already processed notification event.',
        correlationId: event.correlationId,
        causationId: event.causationId,
        messageId: event.messageId,
        messageType: event.type,
        fileId: event.payload.fileId,
        userId: event.payload.userId,
        metadata: { consumerName },
      })));
      return { skipped: true, sent: false };
    }

    if (
      isFailureNotificationEvent(event.type) &&
      await this.repository.hasSentTerminalNotification(event.payload.fileId, event.correlationId)
    ) {
      await this.repository.markProcessedEvent({
        eventId: event.messageId,
        consumerName,
        correlationId: event.correlationId,
        messageType: event.type,
        sourceProducer: event.producer,
      });

      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'notification-service',
        message: 'Skipped duplicate terminal failure notification.',
        correlationId: event.correlationId,
        causationId: event.causationId,
        messageId: event.messageId,
        messageType: event.type,
        fileId: event.payload.fileId,
        userId: event.payload.userId,
        metadata: { consumerName },
      })));
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

      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'notification-service',
        message: 'Notification already sent previously; marking event as processed.',
        correlationId: event.correlationId,
        causationId: event.causationId,
        messageId: event.messageId,
        messageType: event.type,
        fileId: event.payload.fileId,
        userId: event.payload.userId,
        metadata: {
          consumerName,
          recipient,
          templateKey: template.templateKey,
        },
      })));
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

      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'notification-service',
        message: 'Notification sent.',
        correlationId: event.correlationId,
        causationId: event.causationId,
        messageId: event.messageId,
        messageType: event.type,
        routingKey: input.routingKey,
        fileId: event.payload.fileId,
        userId: event.payload.userId,
        metadata: {
          recipient,
          templateKey: template.templateKey,
        },
      })));
      return { skipped: false, sent: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.repository.markNotificationFailed(attempt.notificationId, message);
      throw error;
    }
  }
}

function isFailureNotificationEvent(type: string): boolean {
  return (
    type === 'FileRejected.v1' ||
    type === 'ProcessingFailed.v1' ||
    type === 'ProcessingTimedOut.v1'
  );
}
