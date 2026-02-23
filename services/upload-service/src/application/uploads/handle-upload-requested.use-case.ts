import { Inject, Injectable, Logger } from '@nestjs/common';
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
    this.logger.log(
      `UploadRequested.v1 persisted (file=${command.payload.fileId}) and outbox event queued.`,
    );
  }
}
