import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import {
  VALIDATOR_EVENTS_PUBLISHER_PORT,
  type ValidatorEventsPublisherPort,
} from './ports/validator-events-publisher.port';
import {
  VALIDATOR_OUTBOX_REPOSITORY_PORT,
  type ValidatorOutboxRepositoryPort,
} from './ports/validator-outbox-repository.port';
import { ValidatorServiceConfigService } from '../../infrastructure/config/validator-service-config.service';

@Injectable()
export class PublishValidatorOutboxBatchService {
  private readonly logger = new Logger(PublishValidatorOutboxBatchService.name);
  private isPublishing = false;

  constructor(
    @Inject(VALIDATOR_OUTBOX_REPOSITORY_PORT)
    private readonly repository: ValidatorOutboxRepositoryPort,
    @Inject(VALIDATOR_EVENTS_PUBLISHER_PORT)
    private readonly eventsPublisher: ValidatorEventsPublisherPort,
    private readonly config: ValidatorServiceConfigService,
  ) {}

  async publishPendingBatch(): Promise<void> {
    if (this.isPublishing) {
      return;
    }

    this.isPublishing = true;
    try {
      const pending = await this.repository.findPendingOutboxEvents(this.config.outboxBatchSize);

      for (const event of pending) {
        try {
          await this.eventsPublisher.publishDomainEvent(event.envelope, event.routingKey);
          await this.repository.markOutboxEventPublished(event.eventId);

          this.logger.log(JSON.stringify(createJsonLogEntry({
            level: 'info',
            service: 'validator-service',
            message: 'Validator outbox event published.',
            correlationId: event.envelope.correlationId,
            causationId: event.envelope.causationId,
            messageId: event.envelope.messageId,
            messageType: event.envelope.type,
            routingKey: event.routingKey,
            fileId: typeof (event.envelope.payload as { fileId?: unknown })?.fileId === 'string'
              ? (event.envelope.payload as { fileId?: string }).fileId
              : undefined,
            userId: typeof (event.envelope.payload as { userId?: unknown })?.userId === 'string'
              ? (event.envelope.payload as { userId?: string }).userId
              : undefined,
            metadata: {
              outboxEventId: event.eventId,
              publishAttempt: event.attemptCount + 1,
            },
          })));
        } catch (error) {
          const maxAttempts = this.config.outboxMaxPublishAttempts;
          const publishAttempt = event.attemptCount + 1;
          const terminalFailure = publishAttempt >= maxAttempts;
          const errorMessage = error instanceof Error ? error.message : String(error);

          await this.repository.markOutboxEventPublishFailed(
            event.eventId,
            errorMessage,
            terminalFailure,
          );

          this.logger.error(JSON.stringify(createJsonLogEntry({
            level: 'error',
            service: 'validator-service',
            message: terminalFailure
              ? 'Failed to publish validator outbox event; max attempts reached.'
              : 'Failed to publish validator outbox event; will retry on next poll.',
            correlationId: event.envelope.correlationId,
            causationId: event.envelope.causationId,
            messageId: event.envelope.messageId,
            messageType: event.envelope.type,
            routingKey: event.routingKey,
            fileId: typeof (event.envelope.payload as { fileId?: unknown })?.fileId === 'string'
              ? (event.envelope.payload as { fileId?: string }).fileId
              : undefined,
            userId: typeof (event.envelope.payload as { userId?: unknown })?.userId === 'string'
              ? (event.envelope.payload as { userId?: string }).userId
              : undefined,
            metadata: {
              outboxEventId: event.eventId,
              publishAttempt,
              maxPublishAttempts: maxAttempts,
              terminalFailure,
            },
            error,
          })));
        }
      }
    } finally {
      this.isPublishing = false;
    }
  }
}

