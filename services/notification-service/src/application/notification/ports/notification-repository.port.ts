export const NOTIFICATION_REPOSITORY_PORT = Symbol('NOTIFICATION_REPOSITORY_PORT');

export interface NotificationLogAttemptInput {
  eventId: string;
  eventType: string;
  fileId?: string;
  recipient: string;
  templateKey: string;
  correlationId: string;
}

export interface NotificationLogAttempt {
  notificationId: number;
  status: string;
}

export interface MarkProcessedNotificationEventInput {
  eventId: string;
  consumerName: string;
  correlationId?: string;
  messageType?: string;
  sourceProducer?: string;
}

export interface NotificationRepositoryPort {
  hasProcessedEvent(eventId: string, consumerName: string): Promise<boolean>;
  hasSentTerminalNotification(fileId: string, correlationId: string): Promise<boolean>;
  recordNotificationAttempt(input: NotificationLogAttemptInput): Promise<NotificationLogAttempt>;
  markNotificationSent(notificationId: number, providerMessageId?: string): Promise<void>;
  markNotificationFailed(notificationId: number, errorMessage: string): Promise<void>;
  markProcessedEvent(input: MarkProcessedNotificationEventInput): Promise<void>;
}
