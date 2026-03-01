import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { MarkProcessingSagasTimedOutUseCase } from '../../application/process-manager/mark-processing-sagas-timed-out.use-case';
import { ProjectionServiceConfigService } from '../../infrastructure/config/projection-service-config.service';

@Injectable()
export class ProcessingSagaTimeoutSweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessingSagaTimeoutSweeperService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly markProcessingSagasTimedOutUseCase: MarkProcessingSagasTimedOutUseCase,
    private readonly config: ProjectionServiceConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.processManagerShadowEnabled) {
      return;
    }

    const intervalMs = this.config.processManagerTimeoutSweepIntervalMs;
    this.timer = setInterval(() => {
      void this.runSweep();
    }, intervalMs);
    this.timer.unref();

    this.logger.log(JSON.stringify(createJsonLogEntry({
      level: 'info',
      service: 'projection-service',
      message: 'Shadow processing saga timeout sweeper started.',
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

  private async runSweep(): Promise<void> {
    try {
      const result = await this.markProcessingSagasTimedOutUseCase.execute(new Date().toISOString());
      if (result.updated > 0) {
        this.logger.warn(JSON.stringify(createJsonLogEntry({
          level: 'warn',
          service: 'projection-service',
          message: 'Shadow processing saga timeout sweep updated timed-out sagas.',
          correlationId: 'system',
          metadata: {
            updated: result.updated,
          },
        })));
      }
    } catch (error) {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'projection-service',
        message: 'Shadow processing saga timeout sweep failed.',
        correlationId: 'system',
        error,
      })));
    }
  }
}
