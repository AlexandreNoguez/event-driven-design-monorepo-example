import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createEnvelope,
  generateId,
  type DomainEventV1,
} from '@event-pipeline/shared';
import {
  buildThumbnailObjectKey,
  createThumbnailGeneratedPayload,
  isThumbnailSupportedMime,
  parsePositiveInt,
  parseSupportedMimeTypes,
  parseWebpQuality,
  type FileValidatedEvent,
} from '../../domain/thumbnail/thumbnail-generation';
import {
  THUMBNAIL_EVENTS_PUBLISHER_PORT,
  type ThumbnailEventsPublisherPort,
} from './ports/thumbnail-events-publisher.port';
import {
  THUMBNAIL_IMAGE_PROCESSOR_PORT,
  type ThumbnailImageProcessorPort,
} from './ports/thumbnail-image-processor.port';
import {
  THUMBNAIL_OBJECT_STORAGE_PORT,
  type ThumbnailObjectStoragePort,
} from './ports/thumbnail-object-storage.port';
import {
  THUMBNAIL_PROCESSED_EVENTS_PORT,
  type ThumbnailProcessedEventsPort,
} from './ports/thumbnail-processed-events.port';

@Injectable()
export class HandleFileValidatedUseCase {
  private readonly logger = new Logger(HandleFileValidatedUseCase.name);

  constructor(
    @Inject(THUMBNAIL_OBJECT_STORAGE_PORT)
    private readonly objectStorage: ThumbnailObjectStoragePort,
    @Inject(THUMBNAIL_IMAGE_PROCESSOR_PORT)
    private readonly imageProcessor: ThumbnailImageProcessorPort,
    @Inject(THUMBNAIL_EVENTS_PUBLISHER_PORT)
    private readonly eventsPublisher: ThumbnailEventsPublisherPort,
    @Inject(THUMBNAIL_PROCESSED_EVENTS_PORT)
    private readonly processedEvents: ThumbnailProcessedEventsPort,
  ) {}

  async execute(event: FileValidatedEvent): Promise<{ skipped: boolean; publishedType?: string }> {
    const consumerName = process.env.THUMBNAIL_SERVICE_CONSUMER_NAME ?? 'thumbnail:file-validated';

    if (await this.processedEvents.hasProcessedEvent(event.messageId, consumerName)) {
      this.logger.log(`Skipping already processed event ${event.messageId} (${consumerName}).`);
      return { skipped: true };
    }

    const supportedMimeTypes = parseSupportedMimeTypes(process.env.THUMBNAIL_SERVICE_SUPPORTED_MIME_TYPES);
    if (!isThumbnailSupportedMime(event.payload.contentType, supportedMimeTypes)) {
      await this.processedEvents.markProcessedEvent({
        eventId: event.messageId,
        consumerName,
        correlationId: event.correlationId,
        messageType: event.type,
        sourceProducer: event.producer,
      });

      this.logger.warn(
        `Skipping thumbnail generation for unsupported MIME ${event.payload.contentType} (file=${event.payload.fileId}).`,
      );
      return { skipped: true };
    }

    const thumbnailBucket = process.env.MINIO_BUCKET_THUMBNAILS ?? 'thumbnails';
    const objectKeyPrefix = process.env.THUMBNAIL_SERVICE_OBJECT_KEY_PREFIX ?? 'thumbnails';
    const width = parsePositiveInt(process.env.THUMBNAIL_SERVICE_WIDTH, 320);
    const height = parsePositiveInt(process.env.THUMBNAIL_SERVICE_HEIGHT, 320);
    const webpQuality = parseWebpQuality(process.env.THUMBNAIL_SERVICE_WEBP_QUALITY, 82);

    const source = await this.objectStorage.readObject(event.payload.bucket, event.payload.objectKey);
    const rendered = await this.imageProcessor.generateThumbnail({
      source: source.buffer,
      width,
      height,
      outputFormat: 'webp',
      webpQuality,
    });

    const thumbnailObjectKey = buildThumbnailObjectKey(
      event.payload.fileId,
      rendered.extension,
      objectKeyPrefix,
    );

    await this.objectStorage.writeObject({
      bucket: thumbnailBucket,
      objectKey: thumbnailObjectKey,
      body: rendered.buffer,
      contentType: rendered.contentType,
    });

    const thumbnailGeneratedPayload = createThumbnailGeneratedPayload({
      sourceEvent: event,
      thumbnailBucket,
      thumbnailObjectKey,
      width: rendered.width,
      height: rendered.height,
    });

    const nextEvent: DomainEventV1<'ThumbnailGenerated.v1'> = createEnvelope({
      messageId: generateId(),
      kind: 'event',
      type: 'ThumbnailGenerated.v1',
      producer: 'thumbnail-service',
      payload: thumbnailGeneratedPayload,
      correlationId: event.correlationId,
      causationId: event.messageId,
    });

    await this.eventsPublisher.publishDomainEvent(nextEvent, 'thumbnails.generated.v1');
    await this.processedEvents.markProcessedEvent({
      eventId: event.messageId,
      consumerName,
      correlationId: event.correlationId,
      messageType: event.type,
      sourceProducer: event.producer,
    });

    this.logger.log(`Processed ${event.type} (${event.messageId}) -> ${nextEvent.type}`);
    return {
      skipped: false,
      publishedType: nextEvent.type,
    };
  }
}
