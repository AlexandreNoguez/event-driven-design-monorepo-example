export type MessageKind = 'event' | 'command';
export type MessageVersionTag = `v${number}`;

export interface MessageEnvelope<
  TPayload = unknown,
  TType extends string = string,
  TKind extends MessageKind = MessageKind,
> {
  messageId: string;
  kind: TKind;
  type: TType;
  occurredAt: string;
  correlationId: string;
  causationId?: string;
  producer: string;
  version: number;
  payload: TPayload;
}

export type EventEnvelope<TPayload = unknown, TType extends string = string> = MessageEnvelope<
  TPayload,
  TType,
  'event'
>;

export type CommandEnvelope<TPayload = unknown, TType extends string = string> = MessageEnvelope<
  TPayload,
  TType,
  'command'
>;

export interface CreateEnvelopeInput<
  TPayload,
  TType extends string,
  TKind extends MessageKind = MessageKind,
> {
  messageId: string;
  kind: TKind;
  type: TType;
  producer: string;
  payload: TPayload;
  correlationId: string;
  causationId?: string;
  occurredAt?: string;
  version?: number;
}

export function createEnvelope<
  TPayload,
  TType extends string,
  TKind extends MessageKind = MessageKind,
>(input: CreateEnvelopeInput<TPayload, TType, TKind>): MessageEnvelope<TPayload, TType, TKind> {
  return {
    messageId: input.messageId,
    kind: input.kind,
    type: input.type,
    producer: input.producer,
    payload: input.payload,
    correlationId: input.correlationId,
    causationId: input.causationId,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    version: input.version ?? 1,
  };
}

export function isEventEnvelope<TPayload = unknown>(
  envelope: MessageEnvelope<TPayload>,
): envelope is EventEnvelope<TPayload> {
  return envelope.kind === 'event';
}

export function isCommandEnvelope<TPayload = unknown>(
  envelope: MessageEnvelope<TPayload>,
): envelope is CommandEnvelope<TPayload> {
  return envelope.kind === 'command';
}
