import type { ProjectableEventWithRoutingKey } from '../../../domain/projection/projectable-event';

export const PROJECTION_PROJECTOR_PORT = Symbol('PROJECTION_PROJECTOR_PORT');

export interface ProjectEventInput extends ProjectableEventWithRoutingKey {
  consumerName: string;
}

export interface ProjectionProjectorPort {
  projectEvent(input: ProjectEventInput): Promise<{ applied: boolean }>;
}
