import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { PublishUploadOutboxBatchService } from '../../application/uploads/publish-upload-outbox-batch.service';
import { UploadServiceConfigService } from '../../infrastructure/config/upload-service-config.service';

@Injectable()
export class UploadOutboxPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UploadOutboxPollerService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly publishUploadOutboxBatchService: PublishUploadOutboxBatchService,
    private readonly config: UploadServiceConfigService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.outboxPollIntervalMs;
    this.timer = setInterval(() => {
      void this.safePublishPendingBatch();
    }, intervalMs);

    void this.safePublishPendingBatch();
    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'upload-service',
      message: 'Upload outbox poller started.',
      correlationId: 'system',
      metadata: {
        intervalMs,
      },
    })));
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async safePublishPendingBatch(): Promise<void> {
    try {
      await this.publishUploadOutboxBatchService.publishPendingBatch();
    } catch (error) {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'upload-service',
        message: 'Upload outbox polling loop error.',
        correlationId: 'system',
        error,
      })));
    }
  }
}
