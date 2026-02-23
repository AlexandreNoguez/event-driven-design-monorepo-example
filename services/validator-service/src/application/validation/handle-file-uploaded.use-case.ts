import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createEnvelope,
  generateId,
  type DomainEventV1,
} from '@event-pipeline/shared';
import {
  parseAllowedMimeTypes,
  parseMaxSizeBytes,
  type FileUploadedEvent,
  validateUploadedFile,
} from '../../domain/validation/file-validation';
import {
  FILE_OBJECT_READER_PORT,
  type FileObjectReaderPort,
} from './ports/file-object-reader.port';
import {
  VALIDATOR_EVENTS_PUBLISHER_PORT,
  type ValidatorEventsPublisherPort,
} from './ports/validator-events-publisher.port';
import {
  VALIDATOR_PROCESSED_EVENTS_PORT,
  type ValidatorProcessedEventsPort,
} from './ports/validator-processed-events.port';

@Injectable()
export class HandleFileUploadedUseCase {
  private readonly logger = new Logger(HandleFileUploadedUseCase.name);

  constructor(
    @Inject(FILE_OBJECT_READER_PORT)
    private readonly fileObjectReader: FileObjectReaderPort,
    @Inject(VALIDATOR_EVENTS_PUBLISHER_PORT)
    private readonly eventsPublisher: ValidatorEventsPublisherPort,
    @Inject(VALIDATOR_PROCESSED_EVENTS_PORT)
    private readonly processedEvents: ValidatorProcessedEventsPort,
  ) {}

  async execute(event: FileUploadedEvent): Promise<{ skipped: boolean; publishedType?: string }> {
    const consumerName = process.env.VALIDATOR_SERVICE_CONSUMER_NAME ?? 'validator:file-uploaded';

    if (await this.processedEvents.hasProcessedEvent(event.messageId, consumerName)) {
      this.logger.log(`Skipping already processed event ${event.messageId} (${consumerName}).`);
      return { skipped: true };
    }

    const stat = await this.fileObjectReader.statObject(event.payload.bucket, event.payload.objectKey);
    const signatureBytes = await this.fileObjectReader.readObjectHeader(
      event.payload.bucket,
      event.payload.objectKey,
      parseHeaderProbeBytes(process.env.VALIDATOR_SERVICE_SIGNATURE_READ_BYTES, 64),
    );

    const decision = validateUploadedFile(
      event,
      {
        sizeBytes: stat.sizeBytes,
        eTag: stat.eTag,
        headerBytes: signatureBytes,
      },
      {
        maxSizeBytes: parseMaxSizeBytes(process.env.VALIDATOR_SERVICE_MAX_SIZE_BYTES),
        allowedMimeTypes: parseAllowedMimeTypes(process.env.VALIDATOR_SERVICE_ALLOWED_MIME_TYPES),
      },
    );

    let nextEvent: DomainEventV1;
    let routingKey: string;

    if (decision.outcome === 'validated') {
      nextEvent = createEnvelope({
        messageId: generateId(),
        kind: 'event',
        type: 'FileValidated.v1',
        producer: 'validator-service',
        payload: decision.payload,
        correlationId: event.correlationId,
        causationId: event.messageId,
      });
      routingKey = 'files.validated.v1';
    } else {
      nextEvent = createEnvelope({
        messageId: generateId(),
        kind: 'event',
        type: 'FileRejected.v1',
        producer: 'validator-service',
        payload: decision.payload,
        correlationId: event.correlationId,
        causationId: event.messageId,
      });
      routingKey = 'files.rejected.v1';
    }

    await this.eventsPublisher.publishDomainEvent(nextEvent, routingKey);
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

function parseHeaderProbeBytes(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
