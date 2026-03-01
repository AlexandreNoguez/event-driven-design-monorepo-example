import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import {
  PROCESSING_SAGA_REPOSITORY_PORT,
  type ProcessingSagaRepositoryPort,
} from './ports/processing-saga-repository.port';
import { ProjectionServiceConfigService } from '../../infrastructure/config/projection-service-config.service';

@Injectable()
export class MarkProcessingSagasTimedOutUseCase {
  private readonly logger = new Logger(MarkProcessingSagasTimedOutUseCase.name);

  constructor(
    @Inject(PROCESSING_SAGA_REPOSITORY_PORT)
    private readonly repository: ProcessingSagaRepositoryPort,
    private readonly config: ProjectionServiceConfigService,
  ) {}

  async execute(now: string): Promise<{ updated: number }> {
    if (!this.config.processManagerShadowEnabled) {
      return { updated: 0 };
    }

    const timedOutSagas = await this.repository.markTimedOutSagas(now);

    for (const saga of timedOutSagas) {
      this.logger.warn(JSON.stringify(createJsonLogEntry({
        level: 'warn',
        service: 'projection-service',
        message: 'Shadow processing saga timed out.',
        correlationId: saga.correlationId,
        fileId: saga.fileId,
        metadata: {
          sagaId: saga.sagaId,
          sagaStatus: saga.status,
          comparisonStatus: saga.comparisonStatus,
        },
      })));
    }

    return { updated: timedOutSagas.length };
  }
}
