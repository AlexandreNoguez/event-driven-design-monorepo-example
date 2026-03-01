import type {
  ProcessingSagaComparisonStatus,
  ProcessingSagaState,
  ProcessingSagaStatus,
  ProcessingSagaTerminalEventType,
} from '../../../domain/process-manager/processing-saga';
import type { ProjectableDomainEvent } from '../../../domain/projection/projectable-event';

export const PROCESSING_SAGA_REPOSITORY_PORT = Symbol('PROCESSING_SAGA_REPOSITORY_PORT');

export interface TrackProcessingSagaInput {
  event: ProjectableDomainEvent;
  consumerName: string;
  timeoutMs: number;
}

export interface TrackProcessingSagaResult {
  applied: boolean;
  sagaState?: ProcessingSagaState;
  queuedTerminalEventType?: ProcessingSagaTerminalEventType;
}

export interface TimedOutProcessingSaga {
  sagaId: string;
  fileId: string;
  correlationId: string;
  status: ProcessingSagaStatus;
  comparisonStatus: ProcessingSagaComparisonStatus;
  queuedTerminalEventType?: ProcessingSagaTerminalEventType;
}

export interface ProcessingSagaRepositoryPort {
  trackEvent(input: TrackProcessingSagaInput): Promise<TrackProcessingSagaResult>;
  markTimedOutSagas(now: string): Promise<TimedOutProcessingSaga[]>;
}
