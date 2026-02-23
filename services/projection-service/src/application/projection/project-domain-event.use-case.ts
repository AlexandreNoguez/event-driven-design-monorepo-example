import { Inject, Injectable, Logger } from '@nestjs/common';
import { createEnvelope, EVENT_ROUTING_KEYS_V1, generateId } from '@event-pipeline/shared';
import {
  PROJECTION_PROJECTOR_PORT,
  type ProjectionProjectorPort,
} from './ports/projection-projector.port';
import type { ProjectableEventWithRoutingKey } from '../../domain/projection/projectable-event';
import { ProjectionServiceConfigService } from '../../infrastructure/config/projection-service-config.service';
import {
  PROJECTION_EVENTS_PUBLISHER_PORT,
  type ProjectionEventsPublisherPort,
} from './ports/projection-events-publisher.port';

@Injectable()
export class ProjectDomainEventUseCase {
  private readonly logger = new Logger(ProjectDomainEventUseCase.name);

  constructor(
    @Inject(PROJECTION_PROJECTOR_PORT)
    private readonly projector: ProjectionProjectorPort,
    @Inject(PROJECTION_EVENTS_PUBLISHER_PORT)
    private readonly eventsPublisher: ProjectionEventsPublisherPort,
    private readonly config: ProjectionServiceConfigService,
  ) {}

  async execute(input: ProjectableEventWithRoutingKey): Promise<{ applied: boolean }> {
    const consumerName = this.config.consumerName;
    const result = await this.projector.projectEvent({
      ...input,
      consumerName,
    });

    if (result.applied) {
      this.logger.log(`Projected ${input.event.type} (${input.event.messageId}) to read model.`);
    } else {
      this.logger.log(`Skipped already projected event ${input.event.messageId} (${consumerName}).`);
    }

    if (result.applied && result.processingCompletedSignal) {
      const completionEvent = createEnvelope({
        messageId: generateId(),
        kind: 'event',
        type: 'ProcessingCompleted.v1',
        producer: 'projection-service',
        payload: result.processingCompletedSignal,
        correlationId: input.event.correlationId,
        causationId: input.event.messageId,
      });

      await this.eventsPublisher.publishDomainEvent(
        completionEvent,
        EVENT_ROUTING_KEYS_V1['ProcessingCompleted.v1'],
      );

      this.logger.log(
        `Published ProcessingCompleted.v1 for file=${result.processingCompletedSignal.fileId}.`,
      );
    }

    return result;
  }
}
