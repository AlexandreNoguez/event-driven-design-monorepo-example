import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuditableEventWithRoutingKey } from '../../domain/audit/auditable-event';
import { summarizePayloadForAudit } from '../../domain/audit/auditable-event';
import {
  AUDIT_REPOSITORY_PORT,
  type AuditRepositoryPort,
} from './ports/audit-repository.port';

@Injectable()
export class RecordAuditableEventUseCase {
  private readonly logger = new Logger(RecordAuditableEventUseCase.name);

  constructor(
    @Inject(AUDIT_REPOSITORY_PORT)
    private readonly repository: AuditRepositoryPort,
  ) {}

  async execute(input: AuditableEventWithRoutingKey): Promise<{ applied: boolean }> {
    const consumerName = process.env.AUDIT_SERVICE_CONSUMER_NAME ?? 'audit:events';

    const result = await this.repository.storeAuditableEvent({
      event: input.event,
      routingKey: input.routingKey,
      consumerName,
      payloadSummary: summarizePayloadForAudit(input.event.payload, {
        maxDepth: parsePositiveInt(process.env.AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_DEPTH, 3),
        maxArrayItems: parsePositiveInt(process.env.AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_ARRAY_ITEMS, 10),
        maxStringLength: parsePositiveInt(process.env.AUDIT_SERVICE_PAYLOAD_SUMMARY_MAX_STRING_LENGTH, 200),
      }),
    });

    if (result.applied) {
      this.logger.log(`Audited event ${input.event.type} (${input.event.messageId}).`);
    } else {
      this.logger.log(`Skipped already audited event ${input.event.messageId} (${consumerName}).`);
    }

    return result;
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
