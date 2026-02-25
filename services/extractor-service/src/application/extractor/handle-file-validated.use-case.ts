import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createEnvelope,
  createJsonLogEntry,
  generateId,
  type DomainEventV1,
} from '@event-pipeline/shared';
import {
  buildMetadataMap,
  createMetadataExtractedPayload,
  parseBoolean,
  parseImageMetadataMimeTypes,
  shouldAttemptImageMetadata,
  type FileValidatedEvent,
} from '../../domain/extractor/metadata-extraction';
import {
  EXTRACTOR_EVENTS_PUBLISHER_PORT,
  type ExtractorEventsPublisherPort,
} from './ports/extractor-events-publisher.port';
import {
  EXTRACTOR_OBJECT_STORAGE_PORT,
  type ExtractorObjectStoragePort,
} from './ports/extractor-object-storage.port';
import {
  EXTRACTOR_PROCESSED_EVENTS_PORT,
  type ExtractorProcessedEventsPort,
} from './ports/extractor-processed-events.port';
import {
  IMAGE_METADATA_READER_PORT,
  type ImageMetadataReaderPort,
} from './ports/image-metadata-reader.port';
import { ExtractorServiceConfigService } from '../../infrastructure/config/extractor-service-config.service';

@Injectable()
export class HandleFileValidatedUseCase {
  private readonly logger = new Logger(HandleFileValidatedUseCase.name);

  constructor(
    @Inject(EXTRACTOR_OBJECT_STORAGE_PORT)
    private readonly objectStorage: ExtractorObjectStoragePort,
    @Inject(IMAGE_METADATA_READER_PORT)
    private readonly imageMetadataReader: ImageMetadataReaderPort,
    @Inject(EXTRACTOR_EVENTS_PUBLISHER_PORT)
    private readonly eventsPublisher: ExtractorEventsPublisherPort,
    @Inject(EXTRACTOR_PROCESSED_EVENTS_PORT)
    private readonly processedEvents: ExtractorProcessedEventsPort,
    private readonly config: ExtractorServiceConfigService,
  ) {}

  async execute(event: FileValidatedEvent): Promise<{ skipped: boolean; publishedType?: string }> {
    const consumerName = this.config.consumerName;

    if (await this.processedEvents.hasProcessedEvent(event.messageId, consumerName)) {
      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'extractor-service',
        message: 'Skipped already processed extractor event.',
        correlationId: event.correlationId,
        causationId: event.causationId,
        messageId: event.messageId,
        messageType: event.type,
        fileId: event.payload.fileId,
        metadata: { consumerName },
      })));
      return { skipped: true };
    }

    const objectStat = await this.objectStorage.statObject(event.payload.bucket, event.payload.objectKey);
    const buffer = await this.objectStorage.readObject(event.payload.bucket, event.payload.objectKey);

    const includeSha256 = parseBoolean(String(this.config.includeSha256), true);
    const imageMetadataMimeTypes = parseImageMetadataMimeTypes(this.config.imageMetadataMimeTypesCsv);

    const sha256Checksum = includeSha256 ? this.computeSha256(buffer) : undefined;
    let imageMetadata;

    if (shouldAttemptImageMetadata(event.payload.contentType, imageMetadataMimeTypes)) {
      try {
        imageMetadata = await this.imageMetadataReader.tryReadImageMetadata(buffer);
      } catch (error) {
        this.logger.warn(JSON.stringify(createJsonLogEntry({
          level: 'warn',
          service: 'extractor-service',
          message: 'Unable to read image metadata; continuing with base metadata.',
          correlationId: event.correlationId,
          causationId: event.causationId,
          messageId: event.messageId,
          messageType: event.type,
          fileId: event.payload.fileId,
          userId: event.payload.userId,
          error,
        })));
      }
    }

    const metadataMap = buildMetadataMap({
      sourceEvent: event,
      eTag: objectStat.eTag,
      sha256Checksum,
      imageMetadata,
    });

    if (objectStat.sizeBytes !== event.payload.sizeBytes) {
      metadataMap.storageSizeBytes = objectStat.sizeBytes;
      metadataMap.sizeMismatch = true;
    }

    const payload = createMetadataExtractedPayload({
      sourceEvent: event,
      metadata: metadataMap,
    });

    const nextEvent: DomainEventV1<'MetadataExtracted.v1'> = createEnvelope({
      messageId: generateId(),
      kind: 'event',
      type: 'MetadataExtracted.v1',
      producer: 'extractor-service',
      payload,
      correlationId: event.correlationId,
      causationId: event.messageId,
    });

    await this.eventsPublisher.publishDomainEvent(nextEvent, 'metadata.extracted.v1');
    await this.processedEvents.markProcessedEvent({
      eventId: event.messageId,
      consumerName,
      correlationId: event.correlationId,
      messageType: event.type,
      sourceProducer: event.producer,
    });

    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'extractor-service',
      message: 'Metadata extracted and event published.',
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

  private computeSha256(buffer: Buffer): string {
    return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
  }
}
