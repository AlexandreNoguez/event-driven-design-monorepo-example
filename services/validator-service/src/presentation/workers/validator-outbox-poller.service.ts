import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { PublishValidatorOutboxBatchService } from '../../application/validation/publish-validator-outbox-batch.service';
import { ValidatorServiceConfigService } from '../../infrastructure/config/validator-service-config.service';

@Injectable()
export class ValidatorOutboxPollerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ValidatorOutboxPollerService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly publishValidatorOutboxBatchService: PublishValidatorOutboxBatchService,
    private readonly config: ValidatorServiceConfigService,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.outboxPollIntervalMs;
    this.timer = setInterval(() => {
      void this.safePublishPendingBatch();
    }, intervalMs);

    void this.safePublishPendingBatch();
    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'validator-service',
      message: 'Validator outbox poller started.',
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
      await this.publishValidatorOutboxBatchService.publishPendingBatch();
    } catch (error) {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'validator-service',
        message: 'Validator outbox polling loop error.',
        correlationId: 'system',
        error,
      })));
    }
  }
}

