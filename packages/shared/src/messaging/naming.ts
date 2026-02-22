import { MESSAGE_EXCHANGES, SERVICE_QUEUES } from '../standards.js';

export type MessageExchangeName = (typeof MESSAGE_EXCHANGES)[keyof typeof MESSAGE_EXCHANGES];
export type ServiceQueueName = (typeof SERVICE_QUEUES)[keyof typeof SERVICE_QUEUES];

export function normalizeRoutingKeySegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[_\s/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!normalized) {
    throw new Error(`Invalid routing key segment: "${value}"`);
  }

  return normalized;
}

export function buildRoutingKey(...segments: Array<string | number>): string {
  if (segments.length === 0) {
    throw new Error('Routing key requires at least one segment.');
  }

  return segments.map((segment) => normalizeRoutingKeySegment(String(segment))).join('.');
}

export function normalizeRoutingKey(value: string): string {
  const segments = value.split('.').filter((segment) => segment.trim().length > 0);
  return buildRoutingKey(...segments);
}

export function formatVersionTag(version: number): `v${number}` {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`Invalid version number: ${version}`);
  }

  return `v${version}`;
}

export function eventRoutingKey(domain: string, action: string, version = 1): string {
  return buildRoutingKey(domain, action, formatVersionTag(version));
}

export function commandRoutingKey(target: string, action: string, version = 1): string {
  return buildRoutingKey('commands', target, action, formatVersionTag(version));
}

export function queueNameForService(serviceName: string): string {
  return buildRoutingKey('q', serviceName);
}
