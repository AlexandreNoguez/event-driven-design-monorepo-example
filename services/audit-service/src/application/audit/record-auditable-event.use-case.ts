import { Inject, Injectable, Logger } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import type { AuditableEventWithRoutingKey } from '../../domain/audit/auditable-event';
import { summarizePayloadForAudit } from '../../domain/audit/auditable-event';
import {
  AUDIT_REPOSITORY_PORT,
  type AuditRepositoryPort,
} from './ports/audit-repository.port';
import { AuditServiceConfigService } from '../../infrastructure/config/audit-service-config.service';

@Injectable()
export class RecordAuditableEventUseCase {
  private readonly logger = new Logger(RecordAuditableEventUseCase.name);

  constructor(
    @Inject(AUDIT_REPOSITORY_PORT)
    private readonly repository: AuditRepositoryPort,
    private readonly config: AuditServiceConfigService,
  ) {}

  async execute(input: AuditableEventWithRoutingKey): Promise<{ applied: boolean }> {
    const consumerName = this.config.consumerName;

    const result = await this.repository.storeAuditableEvent({
      event: input.event,
      routingKey: input.routingKey,
      consumerName,
      payloadSummary: summarizePayloadForAudit(input.event.payload, {
        maxDepth: this.config.payloadSummaryMaxDepth,
        maxArrayItems: this.config.payloadSummaryMaxArrayItems,
        maxStringLength: this.config.payloadSummaryMaxStringLength,
      }),
    });

    if (result.applied) {
      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'audit-service',
        message: 'Auditable event persisted.',
        correlationId: input.event.correlationId,
        causationId: input.event.causationId,
        messageId: input.event.messageId,
        messageType: input.event.type,
        routingKey: input.routingKey,
        fileId: typeof (input.event.payload as { fileId?: unknown })?.fileId === 'string'
          ? (input.event.payload as { fileId?: string }).fileId
          : undefined,
        userId: typeof (input.event.payload as { userId?: unknown })?.userId === 'string'
          ? (input.event.payload as { userId?: string }).userId
          : undefined,
      })));
    } else {
      this.logger.log(JSON.stringify(createJsonLogEntry({
        level: 'info',
        service: 'audit-service',
        message: 'Skipped already audited event.',
        correlationId: input.event.correlationId,
        causationId: input.event.causationId,
        messageId: input.event.messageId,
        messageType: input.event.type,
        routingKey: input.routingKey,
        fileId: typeof (input.event.payload as { fileId?: unknown })?.fileId === 'string'
          ? (input.event.payload as { fileId?: string }).fileId
          : undefined,
        userId: typeof (input.event.payload as { userId?: unknown })?.userId === 'string'
          ? (input.event.payload as { userId?: string }).userId
          : undefined,
        metadata: { consumerName },
      })));
    }

    return result;
  }
}
