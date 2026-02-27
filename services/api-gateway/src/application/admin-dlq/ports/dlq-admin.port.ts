export interface DlqQueueSnapshot {
  queue: string;
  mainQueue: string;
  retryExchange: string;
  label: string;
  messages: number;
  messagesReady: number;
  messagesUnacknowledged: number;
  consumers: number;
  state?: string;
  idleSince?: string;
}

export interface DlqPeekMessage {
  messageCountHint?: number;
  redelivered: boolean;
  exchange?: string;
  routingKey?: string;
  payload: unknown;
  payloadEncoding: string;
  properties: Record<string, unknown>;
}

export interface DlqPeekInput {
  queue: string;
  limit: number;
}

export interface DlqRedriveInput {
  queue: string;
  limit: number;
  operationCorrelationId: string;
  requestedByUserId: string;
  requestedByUserName: string;
}

export interface DlqRedriveResult {
  operationCorrelationId: string;
  queue: string;
  mainQueue: string;
  retryExchange: string;
  requested: number;
  fetched: number;
  moved: number;
  failed: number;
  failures: Array<{ index: number; reason: string }>;
  caveat: string;
}

export interface DlqAdminPort {
  listQueues(): Promise<DlqQueueSnapshot[]>;
  peekMessages(input: DlqPeekInput): Promise<DlqPeekMessage[]>;
  redriveMessages(input: DlqRedriveInput): Promise<DlqRedriveResult>;
}

export const DLQ_ADMIN = Symbol('DLQ_ADMIN');
