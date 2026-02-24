import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PublishProjectionOutboxBatchService } from '../../application/projection/publish-projection-outbox-batch.service';
import { ProjectionServiceConfigService } from '../../infrastructure/config/projection-service-config.service';

@Injectable()
export class ProjectionOutboxPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProjectionOutboxPollerService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly publishProjectionOutboxBatchService: PublishProjectionOutboxBatchService,
    private readonly config: ProjectionServiceConfigService,
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
      await this.publishProjectionOutboxBatchService.publishPendingBatch();
    } catch (error) {
      this.logger.error(
        `Outbox polling loop error: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
