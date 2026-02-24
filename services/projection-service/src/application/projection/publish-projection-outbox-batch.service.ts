import { Inject, Injectable, Logger } from '@nestjs/common';
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
          this.logger.log(`Published outbox event ${event.eventId} (${event.routingKey}).`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.repository.markOutboxEventPublishFailed(event.eventId, message);
          this.logger.error(`Failed to publish outbox event ${event.eventId}: ${message}`);
        }
      }
    } finally {
      this.isPublishing = false;
    }
  }
}
