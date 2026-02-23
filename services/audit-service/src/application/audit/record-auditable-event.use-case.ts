import { Inject, Injectable, Logger } from '@nestjs/common';
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
      this.logger.log(`Audited event ${input.event.type} (${input.event.messageId}).`);
    } else {
      this.logger.log(`Skipped already audited event ${input.event.messageId} (${consumerName}).`);
    }

    return result;
  }
}
