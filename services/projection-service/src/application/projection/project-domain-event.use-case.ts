import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import {
  PROJECTION_PROJECTOR_PORT,
  type ProjectionProjectorPort,
} from './ports/projection-projector.port';
import type { ProjectableEventWithRoutingKey } from '../../domain/projection/projectable-event';
import { ProjectionServiceConfigService } from '../../infrastructure/config/projection-service-config.service';

@Injectable()
export class ProjectDomainEventUseCase {
  private readonly logger = new Logger(ProjectDomainEventUseCase.name);

  constructor(
    @Inject(PROJECTION_PROJECTOR_PORT)
    private readonly projector: ProjectionProjectorPort,
    private readonly config: ProjectionServiceConfigService,
  ) {}

  async execute(input: ProjectableEventWithRoutingKey): Promise<{ applied: boolean }> {
    const consumerName = this.config.consumerName;
    const result = await this.projector.projectEvent({
      ...input,
      consumerName,
    });

    if (result.applied) {
      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'projection-service',
        message: 'Projected domain event to read model.',
        correlationId: input.event.correlationId,
        causationId: input.event.causationId,
        messageId: input.event.messageId,
        messageType: input.event.type,
        routingKey: input.routingKey,
        fileId: (input.event.payload as { fileId?: string }).fileId,
        metadata: {
          consumerName,
          applied: true,
        },
      })));
    } else {
      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'projection-service',
        message: 'Skipped already projected event.',
        correlationId: input.event.correlationId,
        causationId: input.event.causationId,
        messageId: input.event.messageId,
        messageType: input.event.type,
        routingKey: input.routingKey,
        fileId: (input.event.payload as { fileId?: string }).fileId,
        metadata: {
          consumerName,
          applied: false,
        },
      })));
    }

    return result;
  }
}
