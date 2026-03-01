import type { ProjectableDomainEvent } from '../projection/projectable-event';

const PIPELINE_STEPS = ['upload', 'validation', 'thumbnail', 'metadata'] as const;

export type ProcessingSagaTerminalEventType =
  | 'ProcessingCompleted.v1'
  | 'ProcessingFailed.v1'
  | 'ProcessingTimedOut.v1';

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

export interface ProcessingSagaTerminalEventSpec {
  type: ProcessingSagaTerminalEventType;
  status: 'completed' | 'failed';
  completedSteps: string[];
  failedStage?: string;
  failureCode?: string;
  failureReason?: string;
  pendingSteps?: string[];
  timeoutAt?: string;
  deadlineAt?: string;
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

  mergeActorContext(next, event);

  if (isTerminalStatus(base.status) && !isObservedTerminalEventType(event.type)) {
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
        observedTerminalEventType: event.type,
        projectionCompletedSteps: event.payload.completedSteps,
      };
      break;
    }
    case 'ProcessingFailed.v1': {
      next.projectionCompletionStatus = 'failed';
      next.projectionCompletionObservedAt = event.occurredAt;
      next.metadata = {
        ...next.metadata,
        observedTerminalEventType: event.type,
        projectionCompletedSteps: event.payload.completedSteps,
        projectionFailureStage: event.payload.failedStage,
        projectionFailureCode: event.payload.failureCode,
        projectionFailureReason: event.payload.failureReason,
      };
      break;
    }
    case 'ProcessingTimedOut.v1': {
      next.projectionCompletionStatus = 'failed';
      next.projectionCompletionObservedAt = event.occurredAt;
      next.metadata = {
        ...next.metadata,
        observedTerminalEventType: event.type,
        projectionCompletedSteps: event.payload.completedSteps,
        projectionPendingSteps: event.payload.pendingSteps,
        projectionTimeoutAt: event.payload.timeoutAt,
        projectionDeadlineAt: event.payload.deadlineAt,
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

export function deriveTerminalEventSpec(
  state: ProcessingSagaState,
): ProcessingSagaTerminalEventSpec | undefined {
  if (!isTerminalStatus(state.status)) {
    return undefined;
  }

  const completedSteps = getCompletedSteps(state);

  switch (state.status) {
    case 'completed':
      return {
        type: 'ProcessingCompleted.v1',
        status: 'completed',
        completedSteps,
      };
    case 'failed':
      return {
        type: 'ProcessingFailed.v1',
        status: 'failed',
        completedSteps,
        failedStage: state.validationCompletedAt ? 'processing' : 'validation',
        failureCode: state.rejectionCode,
        failureReason: state.rejectionReason,
      };
    case 'timed-out':
      return {
        type: 'ProcessingTimedOut.v1',
        status: 'failed',
        completedSteps,
        pendingSteps: getPendingSteps(state),
        timeoutAt: state.timedOutAt ?? state.updatedAt,
        deadlineAt: state.deadlineAt,
      };
  }

  return undefined;
}

export function getCompletedSteps(state: ProcessingSagaState): string[] {
  const completedSteps = ['upload'];

  if (state.validationCompletedAt) {
    completedSteps.push('validation');
  }

  if (state.thumbnailCompletedAt) {
    completedSteps.push('thumbnail');
  }

  if (state.metadataCompletedAt) {
    completedSteps.push('metadata');
  }

  return completedSteps;
}

export function getPendingSteps(state: ProcessingSagaState): string[] {
  const completed = new Set(getCompletedSteps(state));
  return PIPELINE_STEPS.filter((step) => !completed.has(step));
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

  const observedTerminalEventType = getObservedTerminalEventType(state);

  if (state.status === 'completed') {
    return state.projectionCompletionStatus === 'completed' &&
      observedTerminalEventType === 'ProcessingCompleted.v1'
      ? 'match'
      : 'mismatch';
  }

  if (state.status === 'failed') {
    return state.projectionCompletionStatus === 'failed' &&
      (
        observedTerminalEventType === 'ProcessingFailed.v1' ||
        observedTerminalEventType === 'ProcessingCompleted.v1'
      )
      ? 'match'
      : 'mismatch';
  }

  return state.projectionCompletionStatus === 'failed' &&
    observedTerminalEventType === 'ProcessingTimedOut.v1'
    ? 'match'
    : 'mismatch';
}

export function buildSagaId(fileId: string, correlationId: string): string {
  return `${correlationId}:${fileId}`;
}

function mergeActorContext(state: ProcessingSagaState, event: ProjectableDomainEvent): void {
  if ('userId' in event.payload && typeof event.payload.userId === 'string') {
    state.metadata.userId = event.payload.userId;
  }

  if ('tenantId' in event.payload && typeof event.payload.tenantId === 'string') {
    state.metadata.tenantId = event.payload.tenantId;
  }
}

function isObservedTerminalEventType(type: string): type is ProcessingSagaTerminalEventType {
  return (
    type === 'ProcessingCompleted.v1' ||
    type === 'ProcessingFailed.v1' ||
    type === 'ProcessingTimedOut.v1'
  );
}

function getObservedTerminalEventType(
  state: ProcessingSagaState,
): ProcessingSagaTerminalEventType | undefined {
  const observed = state.metadata.observedTerminalEventType;
  return typeof observed === 'string' && isObservedTerminalEventType(observed)
    ? observed
    : undefined;
}
