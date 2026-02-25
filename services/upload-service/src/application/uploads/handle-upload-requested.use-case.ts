import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import {
  createFileUploadedEventEnvelope,
  type PersistUploadAndOutboxInput,
  type UploadRequestedCommandEnvelope,
} from '../../domain/uploads/upload-message.types';
import {
  UPLOAD_REPOSITORY_PORT,
  type UploadRepositoryPort,
} from './ports/upload-repository.port';
import { UploadServiceConfigService } from '../../infrastructure/config/upload-service-config.service';

@Injectable()
export class HandleUploadRequestedUseCase {
  private readonly logger = new Logger(HandleUploadRequestedUseCase.name);

  constructor(
    @Inject(UPLOAD_REPOSITORY_PORT)
    private readonly repository: UploadRepositoryPort,
    private readonly config: UploadServiceConfigService,
  ) {}

  async execute(command: UploadRequestedCommandEnvelope): Promise<void> {
    const fileUploadedEvent = createFileUploadedEventEnvelope(command, {
      bucket: this.config.minioUploadsBucket,
      objectKeyPrefix: this.config.uploadObjectKeyPrefix,
    });

    const input: PersistUploadAndOutboxInput = {
      command,
      fileUploadedEvent,
      routingKey: 'files.uploaded.v1',
    };

    await this.repository.persistUploadAndOutbox(input);
    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'upload-service',
      message: 'UploadRequested.v1 persisted and outbox event queued.',
      correlationId: command.correlationId,
      causationId: command.causationId,
      messageId: command.messageId,
      messageType: command.type,
      fileId: command.payload.fileId,
      userId: command.payload.userId,
      metadata: {
        nextEventType: fileUploadedEvent.type,
        nextRoutingKey: 'files.uploaded.v1',
      },
    })));
  }
}
