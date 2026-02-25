import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import {
  UPLOAD_EVENTS_PUBLISHER_PORT,
  type UploadEventsPublisherPort,
} from './ports/events-publisher.port';
import {
  UPLOAD_REPOSITORY_PORT,
  type UploadRepositoryPort,
} from './ports/upload-repository.port';
import { UploadServiceConfigService } from '../../infrastructure/config/upload-service-config.service';

@Injectable()
export class PublishUploadOutboxBatchService {
  private readonly logger = new Logger(PublishUploadOutboxBatchService.name);
  private isPublishing = false;

  constructor(
    @Inject(UPLOAD_REPOSITORY_PORT)
    private readonly repository: UploadRepositoryPort,
    @Inject(UPLOAD_EVENTS_PUBLISHER_PORT)
    private readonly eventsPublisher: UploadEventsPublisherPort,
    private readonly config: UploadServiceConfigService,
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
          await this.eventsPublisher.publishFileUploaded(event.envelope, event.routingKey);
          await this.repository.markOutboxEventPublished(event.eventId);
          this.logger.log(JSON.stringify(createJsonLogEntry({
            level: 'info',
            service: 'upload-service',
            message: 'Outbox event published.',
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
          await this.repository.markOutboxEventPublishFailed(
            event.eventId,
            error instanceof Error ? error.message : String(error),
            terminalFailure,
          );
          this.logger.error(JSON.stringify(createJsonLogEntry({
            level: 'error',
            service: 'upload-service',
            message: terminalFailure
              ? 'Failed to publish outbox event; max attempts reached.'
              : 'Failed to publish outbox event; will retry on next poll.',
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
