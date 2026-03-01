import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { Pool } from 'pg';
import type {
  MarkProcessedNotificationEventInput,
  NotificationLogAttempt,
  NotificationLogAttemptInput,
  NotificationRepositoryPort,
} from '../../application/notification/ports/notification-repository.port';
import { NotificationServiceConfigService } from '../config/notification-service-config.service';

interface NotificationLogAttemptRow {
  notification_id: number;
  status: string;
}

@Injectable()
export class PostgresNotificationRepository implements NotificationRepositoryPort, OnModuleDestroy {
  private readonly logger = new Logger(PostgresNotificationRepository.name);
  private readonly pool: Pool;

  constructor(config: NotificationServiceConfigService) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 10_000,
    });

    this.pool.on('error', (error: unknown) => {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'notification-service',
        message: 'Postgres pool error in notification repository.',
        correlationId: 'system',
        error,
      })));
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async hasProcessedEvent(eventId: string, consumerName: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from notification_service.processed_events
          where event_id = $1
            and consumer_name = $2
        ) as exists
      `,
      [eventId, consumerName],
    );

    return Boolean(result.rows[0]?.exists);
  }

  async hasSentTerminalNotification(fileId: string, correlationId: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `
        select exists(
          select 1
          from notification_service.notification_logs
          where file_id = $1
            and correlation_id = $2
            and status = 'sent'
            and template_key in (
              'file-rejected',
              'processing-failed',
              'processing-timed-out'
            )
        ) as exists
      `,
      [fileId, correlationId],
    );

    return Boolean(result.rows[0]?.exists);
  }

  async recordNotificationAttempt(input: NotificationLogAttemptInput): Promise<NotificationLogAttempt> {
    const result = await this.pool.query<NotificationLogAttemptRow>(
      `
        insert into notification_service.notification_logs (
          event_id,
          event_type,
          file_id,
          recipient,
          channel,
          template_key,
          status,
          correlation_id,
          attempt_count,
          error_message
        )
        values ($1, $2, $3, $4, 'email', $5, 'pending', $6, 1, null)
        on conflict (event_id, recipient, channel)
        do update set
          event_type = excluded.event_type,
          file_id = excluded.file_id,
          template_key = excluded.template_key,
          correlation_id = excluded.correlation_id,
          status = case
            when notification_service.notification_logs.status = 'sent' then 'sent'
            else 'pending'
          end,
          error_message = case
            when notification_service.notification_logs.status = 'sent' then notification_service.notification_logs.error_message
            else null
          end,
          attempt_count = notification_service.notification_logs.attempt_count + 1,
          sent_at = case
            when notification_service.notification_logs.status = 'sent' then notification_service.notification_logs.sent_at
            else null
          end
        returning notification_id, status
      `,
      [
        input.eventId,
        input.eventType,
        input.fileId ?? null,
        input.recipient,
        input.templateKey,
        input.correlationId,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create notification log attempt.');
    }

    return {
      notificationId: row.notification_id,
      status: row.status,
    };
  }

  async markNotificationSent(notificationId: number, providerMessageId?: string): Promise<void> {
    await this.pool.query(
      `
        update notification_service.notification_logs
        set status = 'sent',
            provider_message_id = $2,
            sent_at = now(),
            error_message = null
        where notification_id = $1
      `,
      [notificationId, providerMessageId ?? null],
    );
  }

  async markNotificationFailed(notificationId: number, errorMessage: string): Promise<void> {
    await this.pool.query(
      `
        update notification_service.notification_logs
        set status = 'failed',
            error_message = left($2, 1000)
        where notification_id = $1
      `,
      [notificationId, errorMessage],
    );
  }

  async markProcessedEvent(input: MarkProcessedNotificationEventInput): Promise<void> {
    await this.pool.query(
      `
        insert into notification_service.processed_events (
          event_id,
          consumer_name,
          correlation_id,
          message_type,
          source_producer
        )
        values ($1, $2, $3, $4, $5)
        on conflict (event_id, consumer_name) do nothing
      `,
      [
        input.eventId,
        input.consumerName,
        input.correlationId ?? null,
        input.messageType ?? null,
        input.sourceProducer ?? null,
      ],
    );
  }
}
