import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import {
  PROJECTION_EVENTS_PUBLISHER_PORT,
  type ProjectionEventsPublisherPort,
} from './ports/projection-events-publisher.port';
import {
  PROJECTION_OUTBOX_REPOSITORY_PORT,
  type ProjectionOutboxRepositoryPort,
} from './ports/projection-outbox-repository.port';
import { ProjectionServiceConfigService } from '../../infrastructure/config/projection-service-config.service';

@Injectable()
export class PublishProjectionOutboxBatchService {
  private readonly logger = new Logger(PublishProjectionOutboxBatchService.name);
  private isPublishing = false;

  constructor(
    @Inject(PROJECTION_OUTBOX_REPOSITORY_PORT)
    private readonly repository: ProjectionOutboxRepositoryPort,
    @Inject(PROJECTION_EVENTS_PUBLISHER_PORT)
    private readonly eventsPublisher: ProjectionEventsPublisherPort,
    private readonly config: ProjectionServiceConfigService,
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
            service: 'projection-service',
            message: 'Projection outbox event published.',
            correlationId: event.envelope.correlationId,
            causationId: event.envelope.causationId,
            messageId: event.envelope.messageId,
            messageType: event.envelope.type,
            routingKey: event.routingKey,
            fileId: typeof (event.envelope.payload as { fileId?: unknown })?.fileId === 'string'
              ? (event.envelope.payload as { fileId?: string }).fileId
              : undefined,
            metadata: {
              outboxEventId: event.eventId,
              publishAttempt: event.attemptCount + 1,
            },
          })));
        } catch (error) {
          const maxAttempts = this.config.outboxMaxPublishAttempts;
          const publishAttempt = event.attemptCount + 1;
          const terminalFailure = publishAttempt >= maxAttempts;
          const message = error instanceof Error ? error.message : String(error);
          await this.repository.markOutboxEventPublishFailed(event.eventId, message, terminalFailure);
          this.logger.error(JSON.stringify(createJsonLogEntry({
            level: 'error',
            service: 'projection-service',
            message: terminalFailure
              ? 'Failed to publish projection outbox event; max attempts reached.'
              : 'Failed to publish projection outbox event; will retry on next poll.',
            correlationId: event.envelope.correlationId,
            causationId: event.envelope.causationId,
            messageId: event.envelope.messageId,
            messageType: event.envelope.type,
            routingKey: event.routingKey,
            fileId: typeof (event.envelope.payload as { fileId?: unknown })?.fileId === 'string'
              ? (event.envelope.payload as { fileId?: string }).fileId
              : undefined,
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
