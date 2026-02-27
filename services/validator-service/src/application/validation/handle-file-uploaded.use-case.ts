import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  createEnvelope,
  createJsonLogEntry,
  generateId,
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
  VALIDATOR_OUTBOX_REPOSITORY_PORT,
  type ValidatorResultEvent,
  type ValidatorOutboxRepositoryPort,
} from './ports/validator-outbox-repository.port';
import { ValidatorServiceConfigService } from '../../infrastructure/config/validator-service-config.service';

@Injectable()
export class HandleFileUploadedUseCase {
  private readonly logger = new Logger(HandleFileUploadedUseCase.name);

  constructor(
    @Inject(FILE_OBJECT_READER_PORT)
    private readonly fileObjectReader: FileObjectReaderPort,
    @Inject(VALIDATOR_OUTBOX_REPOSITORY_PORT)
    private readonly outboxRepository: ValidatorOutboxRepositoryPort,
    private readonly config: ValidatorServiceConfigService,
  ) {}

  async execute(event: FileUploadedEvent): Promise<{ skipped: boolean; publishedType?: string }> {
    const consumerName = this.config.consumerName;

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

    let nextEvent: ValidatorResultEvent;
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

    const persisted = await this.outboxRepository.storeProcessedEventAndOutbox({
      eventId: event.messageId,
      consumerName,
      correlationId: event.correlationId,
      messageType: event.type,
      sourceProducer: event.producer,
      outboxEvent: nextEvent,
      routingKey,
    });

    if (!persisted.applied) {
      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'validator-service',
        message: 'Skipped already processed validator event.',
        correlationId: event.correlationId,
        causationId: event.causationId,
        messageId: event.messageId,
        messageType: event.type,
        fileId: event.payload.fileId,
        metadata: { consumerName },
      })));
      return { skipped: true };
    }

    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'validator-service',
      message: 'Validator processed event and queued result in outbox.',
      correlationId: event.correlationId,
      causationId: event.messageId,
      messageId: nextEvent.messageId,
      messageType: nextEvent.type,
      fileId: event.payload.fileId,
      userId: event.payload.userId,
      metadata: {
        sourceEventType: event.type,
        sourceEventId: event.messageId,
        publishedRoutingKey: routingKey,
      },
    })));
    return {
      skipped: false,
      publishedType: nextEvent.type,
    };
  }
}
