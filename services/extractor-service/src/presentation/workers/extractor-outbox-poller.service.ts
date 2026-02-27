import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { PublishExtractorOutboxBatchService } from '../../application/extractor/publish-extractor-outbox-batch.service';
import { ExtractorServiceConfigService } from '../../infrastructure/config/extractor-service-config.service';

@Injectable()
export class ExtractorOutboxPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExtractorOutboxPollerService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly publishExtractorOutboxBatchService: PublishExtractorOutboxBatchService,
    private readonly config: ExtractorServiceConfigService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.outboxPollIntervalMs;
    this.timer = setInterval(() => {
      void this.safePublishPendingBatch();
    }, intervalMs);

    void this.safePublishPendingBatch();
    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'extractor-service',
      message: 'Extractor outbox poller started.',
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
      await this.publishExtractorOutboxBatchService.publishPendingBatch();
    } catch (error) {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'extractor-service',
        message: 'Extractor outbox polling loop error.',
        correlationId: 'system',
        error,
      })));
    }
  }
}

