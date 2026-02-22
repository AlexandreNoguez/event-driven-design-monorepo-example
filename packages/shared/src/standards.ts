export const MESSAGE_EXCHANGES = {
  events: 'domain.events',
  commands: 'domain.commands',
} as const;

export const SERVICE_QUEUES = {
  uploadCommands: 'q.upload.commands',
  validator: 'q.validator',
  thumbnail: 'q.thumbnail',
  extractor: 'q.extractor',
  projection: 'q.projection',
  notification: 'q.notification',
  audit: 'q.audit',
} as const;

export const DEFAULT_QUEUE_BINDINGS = {
  [SERVICE_QUEUES.uploadCommands]: ['commands.upload.#', 'commands.file.reprocess.*'],
  [SERVICE_QUEUES.validator]: ['files.uploaded.*'],
  [SERVICE_QUEUES.thumbnail]: ['files.validated.*'],
  [SERVICE_QUEUES.extractor]: ['files.validated.*'],
  [SERVICE_QUEUES.projection]: ['#'],
  [SERVICE_QUEUES.notification]: ['processing.#', 'files.rejected.*'],
  [SERVICE_QUEUES.audit]: ['#'],
} as const;

export const EVENT_VERSIONING_STRATEGY = {
  typeSuffixPattern: '.v{n}',
  routingKeySuffixPattern: '.v{n}',
  additiveChanges: 'allowed in same major version when fields remain optional/backward-compatible',
  breakingChanges: 'must publish a new version (v2, v3, ...)',
  consumerCompatibility: 'consumers must ignore unknown fields when possible',
  producerCompatibility: 'producers must not remove/rename existing fields in-place',
  rollout: 'publish old and new versions in parallel during migration when needed',
} as const;

export const JSON_LOG_STANDARD = {
  format: 'json',
  requiredFields: [
    'timestamp',
    'level',
    'service',
    'message',
    'correlationId',
  ],
  optionalTraceFields: [
    'causationId',
    'messageId',
    'messageType',
    'routingKey',
    'queue',
    'userId',
    'fileId',
    'error',
  ],
} as const;
