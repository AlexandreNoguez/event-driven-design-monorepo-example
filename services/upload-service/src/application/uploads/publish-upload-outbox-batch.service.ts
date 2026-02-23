import { Inject, Injectable, Logger } from '@nestjs/common';
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
          this.logger.log(`Published outbox event ${event.eventId} (${event.routingKey}).`);
        } catch (error) {
          await this.repository.markOutboxEventPublishFailed(
            event.eventId,
            error instanceof Error ? error.message : String(error),
          );
          this.logger.error(
            `Failed to publish outbox event ${event.eventId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } finally {
      this.isPublishing = false;
    }
  }
}
