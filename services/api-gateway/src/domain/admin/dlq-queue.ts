export interface KnownDlqQueueTarget {
  mainQueue: string;
  dlqQueue: string;
  retryExchange: string;
  retryRoutingKey: string;
  label: string;
}

const RETRY_ROUTING_KEY = 'retry';

const KNOWN_DLQ_QUEUE_TARGETS: KnownDlqQueueTarget[] = [
  {
    mainQueue: 'q.upload.commands',
    dlqQueue: 'q.upload.commands.dlq',
    retryExchange: 'retry.q.upload.commands',
    retryRoutingKey: RETRY_ROUTING_KEY,
    label: 'upload commands',
  },
  {
    mainQueue: 'q.validator',
    dlqQueue: 'q.validator.dlq',
    retryExchange: 'retry.q.validator',
    retryRoutingKey: RETRY_ROUTING_KEY,
    label: 'validator',
  },
  {
    mainQueue: 'q.thumbnail',
    dlqQueue: 'q.thumbnail.dlq',
    retryExchange: 'retry.q.thumbnail',
    retryRoutingKey: RETRY_ROUTING_KEY,
    label: 'thumbnail',
  },
  {
    mainQueue: 'q.extractor',
    dlqQueue: 'q.extractor.dlq',
    retryExchange: 'retry.q.extractor',
    retryRoutingKey: RETRY_ROUTING_KEY,
    label: 'extractor',
  },
  {
    mainQueue: 'q.projection',
    dlqQueue: 'q.projection.dlq',
    retryExchange: 'retry.q.projection',
    retryRoutingKey: RETRY_ROUTING_KEY,
    label: 'projection',
  },
  {
    mainQueue: 'q.notification',
    dlqQueue: 'q.notification.dlq',
    retryExchange: 'retry.q.notification',
    retryRoutingKey: RETRY_ROUTING_KEY,
    label: 'notification',
  },
  {
    mainQueue: 'q.audit',
    dlqQueue: 'q.audit.dlq',
    retryExchange: 'retry.q.audit',
    retryRoutingKey: RETRY_ROUTING_KEY,
    label: 'audit',
  },
];

export function listKnownDlqQueueTargets(): readonly KnownDlqQueueTarget[] {
  return KNOWN_DLQ_QUEUE_TARGETS;
}

export function resolveKnownDlqQueueTarget(queueName: string): KnownDlqQueueTarget | undefined {
  return KNOWN_DLQ_QUEUE_TARGETS.find((target) => target.dlqQueue === queueName);
}

