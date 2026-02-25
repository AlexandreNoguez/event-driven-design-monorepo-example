import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createEnvelope,
  createJsonLogEntry,
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
import { ThumbnailServiceConfigService } from '../../infrastructure/config/thumbnail-service-config.service';

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
    private readonly config: ThumbnailServiceConfigService,
  ) {}

  async execute(event: FileValidatedEvent): Promise<{ skipped: boolean; publishedType?: string }> {
    const consumerName = this.config.consumerName;

    if (await this.processedEvents.hasProcessedEvent(event.messageId, consumerName)) {
      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'thumbnail-service',
        message: 'Skipped already processed thumbnail event.',
        correlationId: event.correlationId,
        causationId: event.causationId,
        messageId: event.messageId,
        messageType: event.type,
        fileId: event.payload.fileId,
        metadata: { consumerName },
      })));
      return { skipped: true };
    }

    const supportedMimeTypes = parseSupportedMimeTypes(this.config.supportedMimeTypesCsv);
    if (!isThumbnailSupportedMime(event.payload.contentType, supportedMimeTypes)) {
      await this.processedEvents.markProcessedEvent({
        eventId: event.messageId,
        consumerName,
        correlationId: event.correlationId,
        messageType: event.type,
        sourceProducer: event.producer,
      });

      this.logger.warn(JSON.stringify(createJsonLogEntry({
        level: 'warn',
        service: 'thumbnail-service',
        message: 'Skipping thumbnail generation for unsupported MIME.',
        correlationId: event.correlationId,
        causationId: event.causationId,
        messageId: event.messageId,
        messageType: event.type,
        fileId: event.payload.fileId,
        userId: event.payload.userId,
        metadata: {
          contentType: event.payload.contentType,
          consumerName,
        },
      })));
      return { skipped: true };
    }

    const thumbnailBucket = this.config.thumbnailsBucket;
    const objectKeyPrefix = this.config.objectKeyPrefix;
    const width = parsePositiveInt(String(this.config.width), 320);
    const height = parsePositiveInt(String(this.config.height), 320);
    const webpQuality = parseWebpQuality(String(this.config.webpQuality), 82);

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

    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'thumbnail-service',
      message: 'Thumbnail generated and event published.',
      correlationId: event.correlationId,
      causationId: event.messageId,
      messageId: nextEvent.messageId,
      messageType: nextEvent.type,
      fileId: event.payload.fileId,
      userId: event.payload.userId,
      metadata: {
        sourceEventId: event.messageId,
        sourceEventType: event.type,
      },
    })));
    return {
      skipped: false,
      publishedType: nextEvent.type,
    };
  }
}
