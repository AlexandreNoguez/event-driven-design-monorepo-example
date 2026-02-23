import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PROJECTION_PROJECTOR_PORT,
  type ProjectionProjectorPort,
} from './ports/projection-projector.port';
import type { ProjectableEventWithRoutingKey } from '../../domain/projection/projectable-event';

@Injectable()
export class ProjectDomainEventUseCase {
  private readonly logger = new Logger(ProjectDomainEventUseCase.name);

  constructor(
    @Inject(PROJECTION_PROJECTOR_PORT)
    private readonly projector: ProjectionProjectorPort,
  ) {}

  async execute(input: ProjectableEventWithRoutingKey): Promise<{ applied: boolean }> {
    const consumerName = process.env.PROJECTION_SERVICE_CONSUMER_NAME ?? 'projection:events';
    const result = await this.projector.projectEvent({
      ...input,
      consumerName,
    });

    if (result.applied) {
      this.logger.log(`Projected ${input.event.type} (${input.event.messageId}) to read model.`);
    } else {
      this.logger.log(`Skipped already projected event ${input.event.messageId} (${consumerName}).`);
    }

    return result;
  }
}
