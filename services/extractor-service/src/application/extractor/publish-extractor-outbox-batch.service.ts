import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import {
  EXTRACTOR_EVENTS_PUBLISHER_PORT,
  type ExtractorEventsPublisherPort,
} from './ports/extractor-events-publisher.port';
import {
  EXTRACTOR_OUTBOX_REPOSITORY_PORT,
  type ExtractorOutboxRepositoryPort,
} from './ports/extractor-outbox-repository.port';
import { ExtractorServiceConfigService } from '../../infrastructure/config/extractor-service-config.service';

@Injectable()
export class PublishExtractorOutboxBatchService {
  private readonly logger = new Logger(PublishExtractorOutboxBatchService.name);
  private isPublishing = false;

  constructor(
    @Inject(EXTRACTOR_OUTBOX_REPOSITORY_PORT)
    private readonly repository: ExtractorOutboxRepositoryPort,
    @Inject(EXTRACTOR_EVENTS_PUBLISHER_PORT)
    private readonly eventsPublisher: ExtractorEventsPublisherPort,
    private readonly config: ExtractorServiceConfigService,
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
            service: 'extractor-service',
            message: 'Extractor outbox event published.',
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
            service: 'extractor-service',
            message: terminalFailure
              ? 'Failed to publish extractor outbox event; max attempts reached.'
              : 'Failed to publish extractor outbox event; will retry on next poll.',
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

