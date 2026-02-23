export interface CommandEnvelopeLike {
  messageId: string;
  type: string;
  correlationId: string;
  causationId?: string;
  producer: string;
  version: number;
  kind: 'command';
  payload: unknown;
  occurredAt: string;
}

export const COMMAND_PUBLISHER = Symbol('COMMAND_PUBLISHER');

export interface CommandPublisher {
  publishCommand(envelope: CommandEnvelopeLike, routingKey: string): Promise<void>;
}
