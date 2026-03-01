import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import {
  PROCESSING_SAGA_REPOSITORY_PORT,
  type ProcessingSagaRepositoryPort,
} from './ports/processing-saga-repository.port';
import type { ProjectableEventWithRoutingKey } from '../../domain/projection/projectable-event';
import { ProjectionServiceConfigService } from '../../infrastructure/config/projection-service-config.service';

@Injectable()
export class TrackProcessingSagaUseCase {
  private readonly logger = new Logger(TrackProcessingSagaUseCase.name);

  constructor(
    @Inject(PROCESSING_SAGA_REPOSITORY_PORT)
    private readonly repository: ProcessingSagaRepositoryPort,
    private readonly config: ProjectionServiceConfigService,
  ) {}

  async execute(input: ProjectableEventWithRoutingKey): Promise<{ applied: boolean }> {
    if (!this.config.processManagerShadowEnabled) {
      return { applied: false };
    }

    const result = await this.repository.trackEvent({
      event: input.event,
      consumerName: this.config.processManagerShadowConsumerName,
      timeoutMs: this.config.processManagerTimeoutMs,
    });

    if (!result.applied || !result.sagaState) {
      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'projection-service',
        message: 'Skipped already processed shadow saga event.',
        correlationId: input.event.correlationId,
        causationId: input.event.causationId,
        messageId: input.event.messageId,
        messageType: input.event.type,
        routingKey: input.routingKey,
        fileId: input.event.payload.fileId,
        metadata: {
          consumerName: this.config.processManagerShadowConsumerName,
          applied: false,
        },
      })));
      return { applied: false };
    }

    const level = result.sagaState.comparisonStatus === 'mismatch' ? 'warn' : 'info';
    const payload = createJsonLogEntry({
      level,
      service: 'projection-service',
      message: 'Tracked shadow processing saga state.',
      correlationId: input.event.correlationId,
      causationId: input.event.causationId,
      messageId: input.event.messageId,
      messageType: input.event.type,
      routingKey: input.routingKey,
      fileId: input.event.payload.fileId,
        metadata: {
          consumerName: this.config.processManagerShadowConsumerName,
          sagaId: result.sagaState.sagaId,
          sagaStatus: result.sagaState.status,
          comparisonStatus: result.sagaState.comparisonStatus,
          projectionCompletionStatus: result.sagaState.projectionCompletionStatus,
          queuedTerminalEventType: result.queuedTerminalEventType,
        },
      });

    if (level === 'warn') {
      this.logger.warn(JSON.stringify(payload));
    } else {
      this.logger.log(JSON.stringify(payload));
    }

    return { applied: true };
  }
}
