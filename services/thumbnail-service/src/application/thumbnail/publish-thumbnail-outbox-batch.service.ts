import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import {
  THUMBNAIL_EVENTS_PUBLISHER_PORT,
  type ThumbnailEventsPublisherPort,
} from './ports/thumbnail-events-publisher.port';
import {
  THUMBNAIL_OUTBOX_REPOSITORY_PORT,
  type ThumbnailOutboxRepositoryPort,
} from './ports/thumbnail-outbox-repository.port';
import { ThumbnailServiceConfigService } from '../../infrastructure/config/thumbnail-service-config.service';

@Injectable()
export class PublishThumbnailOutboxBatchService {
  private readonly logger = new Logger(PublishThumbnailOutboxBatchService.name);
  private isPublishing = false;

  constructor(
    @Inject(THUMBNAIL_OUTBOX_REPOSITORY_PORT)
    private readonly repository: ThumbnailOutboxRepositoryPort,
    @Inject(THUMBNAIL_EVENTS_PUBLISHER_PORT)
    private readonly eventsPublisher: ThumbnailEventsPublisherPort,
    private readonly config: ThumbnailServiceConfigService,
  ) {}

  async publishPendingBatch(): Promise<void> {
    if (this.isPublishing) {
      return;
    }

    this.isPublishing = true;
    try {
      const pending = await this.repository.findPendingOutboxEvents(this.config.outboxBatchSize);

      for (const event of pending) {
        try {
          await this.eventsPublisher.publishDomainEvent(event.envelope, event.routingKey);
          await this.repository.markOutboxEventPublished(event.eventId);

          this.logger.log(JSON.stringify(createJsonLogEntry({
            level: 'info',
            service: 'thumbnail-service',
            message: 'Thumbnail outbox event published.',
            correlationId: event.envelope.correlationId,
            causationId: event.envelope.causationId,
            messageId: event.envelope.messageId,
            messageType: event.envelope.type,
            routingKey: event.routingKey,
            fileId: event.envelope.payload.fileId,
            userId: event.envelope.payload.userId,
            metadata: {
              outboxEventId: event.eventId,
              publishAttempt: event.attemptCount + 1,
            },
          })));
        } catch (error) {
          const maxAttempts = this.config.outboxMaxPublishAttempts;
          const publishAttempt = event.attemptCount + 1;
          const terminalFailure = publishAttempt >= maxAttempts;
          const errorMessage = error instanceof Error ? error.message : String(error);

          await this.repository.markOutboxEventPublishFailed(
            event.eventId,
            errorMessage,
            terminalFailure,
          );

          this.logger.error(JSON.stringify(createJsonLogEntry({
            level: 'error',
            service: 'thumbnail-service',
            message: terminalFailure
              ? 'Failed to publish thumbnail outbox event; max attempts reached.'
              : 'Failed to publish thumbnail outbox event; will retry on next poll.',
            correlationId: event.envelope.correlationId,
            causationId: event.envelope.causationId,
            messageId: event.envelope.messageId,
            messageType: event.envelope.type,
            routingKey: event.routingKey,
            fileId: event.envelope.payload.fileId,
            userId: event.envelope.payload.userId,
            metadata: {
              outboxEventId: event.eventId,
              publishAttempt,
              maxPublishAttempts: maxAttempts,
              terminalFailure,
            },
            error,
          })));
        }
      }
    } finally {
      this.isPublishing = false;
    }
  }
}

