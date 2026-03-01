import type { DomainEventV1 } from '@event-pipeline/shared';

export type NotifiableEventType =
  | 'FileRejected.v1'
  | 'ProcessingCompleted.v1'
  | 'ProcessingFailed.v1'
  | 'ProcessingTimedOut.v1';

export type NotifiableEvent = {
  [K in NotifiableEventType]: DomainEventV1<K>;
}[NotifiableEventType];

export interface NotifiableEventWithRoutingKey {
  event: NotifiableEvent;
  routingKey?: string;
}

export interface NotificationTemplate {
  templateKey: string;
  subject: string;
  text: string;
}

export interface NotificationMessageDraft {
  fileId?: string;
  recipient: string;
  template: NotificationTemplate;
}

export function isNotifiableEvent(value: unknown): value is NotifiableEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== 'event' ||
    typeof candidate.type !== 'string' ||
    typeof candidate.messageId !== 'string' ||
    typeof candidate.correlationId !== 'string' ||
    typeof candidate.producer !== 'string' ||
    typeof candidate.occurredAt !== 'string' ||
    typeof candidate.version !== 'number' ||
    !candidate.payload ||
    typeof candidate.payload !== 'object'
  ) {
    return false;
  }

  if (!isNotifiableEventType(candidate.type)) {
    return false;
  }

  const payload = candidate.payload as Record<string, unknown>;
  if (typeof payload.fileId !== 'string') {
    return false;
  }

  if (candidate.type === 'FileRejected.v1') {
    return typeof payload.code === 'string' && typeof payload.reason === 'string';
  }

  if (candidate.type === 'ProcessingFailed.v1') {
    return (
      typeof payload.status === 'string' &&
      payload.status === 'failed' &&
      Array.isArray(payload.completedSteps) &&
      payload.completedSteps.every((value) => typeof value === 'string') &&
      typeof payload.failedStage === 'string'
    );
  }

  if (candidate.type === 'ProcessingTimedOut.v1') {
    return (
      typeof payload.status === 'string' &&
      payload.status === 'failed' &&
      Array.isArray(payload.completedSteps) &&
      payload.completedSteps.every((value) => typeof value === 'string') &&
      Array.isArray(payload.pendingSteps) &&
      payload.pendingSteps.every((value) => typeof value === 'string') &&
      typeof payload.timeoutAt === 'string' &&
      typeof payload.deadlineAt === 'string'
    );
  }

  return (
    typeof payload.status === 'string' &&
    Array.isArray(payload.completedSteps) &&
    payload.completedSteps.every((value) => typeof value === 'string')
  );
}

export function isNotifiableEventType(type: string): type is NotifiableEventType {
  return (
    type === 'FileRejected.v1' ||
    type === 'ProcessingCompleted.v1' ||
    type === 'ProcessingFailed.v1' ||
    type === 'ProcessingTimedOut.v1'
  );
}

export function resolveRecipientForEvent(event: NotifiableEvent, config?: {
  fallbackRecipient?: string;
  defaultRecipientDomain?: string;
}): string {
  const userId = 'userId' in event.payload ? event.payload.userId : undefined;
  if (typeof userId === 'string' && userId.trim().length > 0) {
    const localPart = sanitizeEmailLocalPart(userId.trim());
    const domain = sanitizeDomain(config?.defaultRecipientDomain) ?? 'event-pipeline.local';
    return `${localPart}@${domain}`;
  }

  const fallback = config?.fallbackRecipient?.trim();
  if (fallback) {
    return fallback;
  }

  return `notifications@event-pipeline.local`;
}

export function buildNotificationTemplate(event: NotifiableEvent): NotificationTemplate {
  switch (event.type) {
    case 'FileRejected.v1': {
      const reason = event.payload.reason;
      return {
        templateKey: 'file-rejected',
        subject: `[Upload] Arquivo rejeitado (${event.payload.fileId})`,
        text: [
          'Seu arquivo foi rejeitado durante a etapa de validação.',
          `fileId: ${event.payload.fileId}`,
          `motivo: ${reason}`,
          `codigo: ${event.payload.code}`,
          `correlationId: ${event.correlationId}`,
        ].join('\n'),
      };
    }
    case 'ProcessingCompleted.v1': {
      const statusLabel = event.payload.status === 'completed' ? 'concluído' : 'falhou';
      const templateKey = event.payload.status === 'completed' ? 'processing-completed' : 'processing-failed';
      return {
        templateKey,
        subject: `[Upload] Processamento ${statusLabel} (${event.payload.fileId})`,
        text: [
          `O processamento do arquivo ${event.payload.fileId} foi ${statusLabel}.`,
          `status: ${event.payload.status}`,
          `etapas concluídas: ${event.payload.completedSteps.join(', ') || '(nenhuma)'}`,
          `correlationId: ${event.correlationId}`,
        ].join('\n'),
      };
    }
    case 'ProcessingFailed.v1':
      return {
        templateKey: 'processing-failed',
        subject: `[Upload] Processamento falhou (${event.payload.fileId})`,
        text: [
          `O processamento do arquivo ${event.payload.fileId} falhou.`,
          `status: ${event.payload.status}`,
          `etapas concluídas: ${event.payload.completedSteps.join(', ') || '(nenhuma)'}`,
          `etapa com falha: ${event.payload.failedStage}`,
          `codigo: ${event.payload.failureCode ?? '(nao informado)'}`,
          `motivo: ${event.payload.failureReason ?? '(nao informado)'}`,
          `correlationId: ${event.correlationId}`,
        ].join('\n'),
      };
    case 'ProcessingTimedOut.v1':
      return {
        templateKey: 'processing-timed-out',
        subject: `[Upload] Processamento expirou (${event.payload.fileId})`,
        text: [
          `O processamento do arquivo ${event.payload.fileId} excedeu o tempo limite.`,
          `status: ${event.payload.status}`,
          `etapas concluídas: ${event.payload.completedSteps.join(', ') || '(nenhuma)'}`,
          `etapas pendentes: ${event.payload.pendingSteps.join(', ') || '(nenhuma)'}`,
          `deadlineAt: ${event.payload.deadlineAt}`,
          `timeoutAt: ${event.payload.timeoutAt}`,
          `correlationId: ${event.correlationId}`,
        ].join('\n'),
      };
  }

  return assertNever(event);
}

function sanitizeEmailLocalPart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._+-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'user';
}

function sanitizeDomain(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '')
    .replace(/\.+/g, '.')
    .replace(/^-|-$/g, '');

  return normalized.length > 0 ? normalized : undefined;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported notifiable event: ${JSON.stringify(value)}`);
}
