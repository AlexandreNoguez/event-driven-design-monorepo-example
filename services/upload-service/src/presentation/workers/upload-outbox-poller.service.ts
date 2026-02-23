import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PublishUploadOutboxBatchService } from '../../application/uploads/publish-upload-outbox-batch.service';

@Injectable()
export class UploadOutboxPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UploadOutboxPollerService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly publishUploadOutboxBatchService: PublishUploadOutboxBatchService) {}

  onModuleInit(): void {
    const intervalMs = parsePositiveInt(process.env.UPLOAD_SERVICE_OUTBOX_POLL_INTERVAL_MS, 2000);
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

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
