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
import { ValidatorServiceConfigService } from '../../infrastructure/config/validator-service-config.service';

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
    private readonly config: ValidatorServiceConfigService,
  ) {}

  async execute(event: FileUploadedEvent): Promise<{ skipped: boolean; publishedType?: string }> {
    const consumerName = this.config.consumerName;

    if (await this.processedEvents.hasProcessedEvent(event.messageId, consumerName)) {
      this.logger.log(`Skipping already processed event ${event.messageId} (${consumerName}).`);
      return { skipped: true };
    }

    const stat = await this.fileObjectReader.statObject(event.payload.bucket, event.payload.objectKey);
    const signatureBytes = await this.fileObjectReader.readObjectHeader(
      event.payload.bucket,
      event.payload.objectKey,
      this.config.signatureReadBytes,
    );

    const decision = validateUploadedFile(
      event,
      {
        sizeBytes: stat.sizeBytes,
        eTag: stat.eTag,
        headerBytes: signatureBytes,
      },
      {
        maxSizeBytes: parseMaxSizeBytes(String(this.config.maxSizeBytes)),
        allowedMimeTypes: parseAllowedMimeTypes(this.config.allowedMimeTypesCsv),
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
