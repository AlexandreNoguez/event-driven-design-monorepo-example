import type { ProjectableDomainEvent } from '../projection/projectable-event';

export type ProcessingSagaStatus =
  | 'started'
  | 'awaiting-validation'
  | 'awaiting-processing-branches'
  | 'partially-completed'
  | 'completed'
  | 'failed'
  | 'timed-out';

export type ProcessingSagaComparisonStatus = 'pending' | 'match' | 'mismatch';

export interface ProcessingSagaState {
  sagaId: string;
  fileId: string;
  correlationId: string;
  status: ProcessingSagaStatus;
  comparisonStatus: ProcessingSagaComparisonStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  deadlineAt: string;
  validationCompletedAt?: string;
  thumbnailCompletedAt?: string;
  metadataCompletedAt?: string;
  rejectedAt?: string;
  timedOutAt?: string;
  rejectionCode?: string;
  rejectionReason?: string;
  projectionCompletionStatus?: 'completed' | 'failed';
  projectionCompletionObservedAt?: string;
  lastEventId: string;
  lastEventType: string;
  lastEventOccurredAt: string;
  metadata: Record<string, unknown>;
}

export interface ApplyProcessingSagaEventInput {
  current?: ProcessingSagaState;
  event: ProjectableDomainEvent;
  timeoutMs: number;
}

export function applyProcessingSagaEvent(
  input: ApplyProcessingSagaEventInput,
): ProcessingSagaState {
  const { current, event, timeoutMs } = input;
  const base = current ?? createInitialState(event, timeoutMs);

  const next: ProcessingSagaState = {
    ...base,
    fileId: event.payload.fileId,
    correlationId: event.correlationId,
    updatedAt: event.occurredAt,
    lastEventId: event.messageId,
    lastEventType: event.type,
    lastEventOccurredAt: event.occurredAt,
    metadata: {
      ...base.metadata,
      lastProducer: event.producer,
      lastRoutingHint: event.type,
    },
  };

  if (isTerminalStatus(base.status) && event.type !== 'ProcessingCompleted.v1') {
    next.comparisonStatus = deriveComparisonStatus(next);
    return next;
  }

  switch (event.type) {
    case 'FileUploaded.v1': {
      next.status = 'awaiting-validation';
      next.metadata = {
        ...next.metadata,
        fileName: event.payload.fileName,
        contentType: event.payload.contentType,
        sizeBytes: event.payload.sizeBytes,
      };
      break;
    }
    case 'FileValidated.v1': {
      next.validationCompletedAt = event.occurredAt;
      next.status = hasCompletedBothBranches(next)
        ? 'completed'
        : 'awaiting-processing-branches';
      if (next.status === 'completed') {
        next.completedAt = event.occurredAt;
      }
      break;
    }
    case 'ThumbnailGenerated.v1': {
      next.thumbnailCompletedAt = event.occurredAt;
      next.status = deriveBranchProgressStatus(next);
      if (next.status === 'completed') {
        next.completedAt = event.occurredAt;
      }
      break;
    }
    case 'MetadataExtracted.v1': {
      next.metadataCompletedAt = event.occurredAt;
      next.status = deriveBranchProgressStatus(next);
      if (next.status === 'completed') {
        next.completedAt = event.occurredAt;
      }
      break;
    }
    case 'FileRejected.v1': {
      next.status = 'failed';
      next.rejectedAt = event.occurredAt;
      next.completedAt = event.occurredAt;
      next.rejectionCode = event.payload.code;
      next.rejectionReason = event.payload.reason;
      break;
    }
    case 'ProcessingCompleted.v1': {
      next.projectionCompletionStatus = event.payload.status;
      next.projectionCompletionObservedAt = event.occurredAt;
      next.metadata = {
        ...next.metadata,
        projectionCompletedSteps: event.payload.completedSteps,
      };
      break;
    }
  }

  next.comparisonStatus = deriveComparisonStatus(next);
  return next;
}

export function markProcessingSagaTimedOut(
  state: ProcessingSagaState,
  timedOutAt: string,
): ProcessingSagaState {
  if (isTerminalStatus(state.status)) {
    return state;
  }

  const next: ProcessingSagaState = {
    ...state,
    status: 'timed-out',
    timedOutAt,
    completedAt: state.completedAt ?? timedOutAt,
    updatedAt: timedOutAt,
    lastEventType: 'TimerExpired.shadow',
    lastEventOccurredAt: timedOutAt,
  };
  next.comparisonStatus = deriveComparisonStatus(next);
  return next;
}

export function isTerminalStatus(status: ProcessingSagaStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'timed-out';
}

function createInitialState(
  event: ProjectableDomainEvent,
  timeoutMs: number,
): ProcessingSagaState {
  const startedAt = event.occurredAt;
  return {
    sagaId: buildSagaId(event.payload.fileId, event.correlationId),
    fileId: event.payload.fileId,
    correlationId: event.correlationId,
    status: 'started',
    comparisonStatus: 'pending',
    startedAt,
    updatedAt: startedAt,
    deadlineAt: new Date(Date.parse(startedAt) + timeoutMs).toISOString(),
    lastEventId: event.messageId,
    lastEventType: event.type,
    lastEventOccurredAt: startedAt,
    metadata: {},
  };
}

function hasCompletedBothBranches(state: ProcessingSagaState): boolean {
  return Boolean(state.thumbnailCompletedAt && state.metadataCompletedAt && state.validationCompletedAt);
}

function deriveBranchProgressStatus(state: ProcessingSagaState): ProcessingSagaStatus {
  if (hasCompletedBothBranches(state)) {
    return 'completed';
  }

  if (!state.validationCompletedAt) {
    return 'awaiting-validation';
  }

  if (state.thumbnailCompletedAt || state.metadataCompletedAt) {
    return 'partially-completed';
  }

  return 'awaiting-processing-branches';
}

function deriveComparisonStatus(state: ProcessingSagaState): ProcessingSagaComparisonStatus {
  if (!state.projectionCompletionStatus || !isTerminalStatus(state.status)) {
    return 'pending';
  }

  const expectedProjectionStatus = state.status === 'completed' ? 'completed' : 'failed';
  return expectedProjectionStatus === state.projectionCompletionStatus ? 'match' : 'mismatch';
}

export function buildSagaId(fileId: string, correlationId: string): string {
  return `${correlationId}:${fileId}`;
}
