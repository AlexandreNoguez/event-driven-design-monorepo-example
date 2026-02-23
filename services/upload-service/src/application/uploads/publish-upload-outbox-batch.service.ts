import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  UPLOAD_EVENTS_PUBLISHER_PORT,
  type UploadEventsPublisherPort,
} from './ports/events-publisher.port';
import {
  UPLOAD_REPOSITORY_PORT,
  type UploadRepositoryPort,
} from './ports/upload-repository.port';

@Injectable()
export class PublishUploadOutboxBatchService {
  private readonly logger = new Logger(PublishUploadOutboxBatchService.name);
  private isPublishing = false;

  constructor(
    @Inject(UPLOAD_REPOSITORY_PORT)
    private readonly repository: UploadRepositoryPort,
    @Inject(UPLOAD_EVENTS_PUBLISHER_PORT)
    private readonly eventsPublisher: UploadEventsPublisherPort,
  ) {}

  async publishPendingBatch(): Promise<void> {
    if (this.isPublishing) {
      return;
    }

    this.isPublishing = true;
    try {
      const batchSize = parsePositiveInt(process.env.UPLOAD_SERVICE_OUTBOX_BATCH_SIZE, 50);
      const pending = await this.repository.findPendingOutboxEvents(batchSize);

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

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
