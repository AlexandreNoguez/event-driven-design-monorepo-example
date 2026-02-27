import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { PublishThumbnailOutboxBatchService } from '../../application/thumbnail/publish-thumbnail-outbox-batch.service';
import { ThumbnailServiceConfigService } from '../../infrastructure/config/thumbnail-service-config.service';

@Injectable()
export class ThumbnailOutboxPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ThumbnailOutboxPollerService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly publishThumbnailOutboxBatchService: PublishThumbnailOutboxBatchService,
    private readonly config: ThumbnailServiceConfigService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.outboxPollIntervalMs;
    this.timer = setInterval(() => {
      void this.safePublishPendingBatch();
    }, intervalMs);

    void this.safePublishPendingBatch();
    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'thumbnail-service',
      message: 'Thumbnail outbox poller started.',
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
      await this.publishThumbnailOutboxBatchService.publishPendingBatch();
    } catch (error) {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'thumbnail-service',
        message: 'Thumbnail outbox polling loop error.',
        correlationId: 'system',
        error,
      })));
    }
  }
}

