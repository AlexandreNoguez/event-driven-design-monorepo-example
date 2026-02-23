import type { AuditableEvent } from '../../../domain/audit/auditable-event';

export const AUDIT_REPOSITORY_PORT = Symbol('AUDIT_REPOSITORY_PORT');

export interface StoreAuditableEventInput {
  event: AuditableEvent;
  routingKey?: string;
  consumerName: string;
  payloadSummary: Record<string, unknown>;
}

export interface AuditRepositoryPort {
  storeAuditableEvent(input: StoreAuditableEventInput): Promise<{ applied: boolean }>;
}
