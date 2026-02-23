import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
    this.logger.log(`Outbox publisher started with poll interval ${intervalMs}ms.`);
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
      this.logger.error(
        `Outbox polling loop error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
