import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type {
  OutboxPendingEvent,
  PersistUploadAndOutboxInput,
} from '../../domain/uploads/upload-message.types';
import type { UploadRepositoryPort } from '../../application/uploads/ports/upload-repository.port';
import { UploadServiceConfigService } from '../config/upload-service-config.service';

interface OutboxRow {
  event_id: string;
  routing_key: string;
  payload: unknown;
}

@Injectable()
export class PostgresUploadRepository implements UploadRepositoryPort, OnModuleDestroy {
  private readonly logger = new Logger(PostgresUploadRepository.name);
  private readonly pool: Pool;

  constructor(config: UploadServiceConfigService) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 10_000,
    });

    this.pool.on('error', (error) => {
      this.logger.error(
        `Postgres pool error: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async persistUploadAndOutbox(input: PersistUploadAndOutboxInput): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      await this.upsertFile(client, input);
      await this.insertOutboxEvent(client, input);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findPendingOutboxEvents(limit: number): Promise<OutboxPendingEvent[]> {
    const result = await this.pool.query<OutboxRow>(
      `
        select event_id, routing_key, payload
        from upload_service.outbox_events
        where publish_status = 'pending'
        order by created_at asc
        limit $1
      `,
      [limit],
    );

    return result.rows
      .map((row) => {
        if (!row.payload || typeof row.payload !== 'object') {
          return undefined;
        }

        return {
          eventId: row.event_id,
          routingKey: row.routing_key,
          envelope: row.payload as OutboxPendingEvent['envelope'],
        };
      })
      .filter((row): row is OutboxPendingEvent => row !== undefined);
  }

  async markOutboxEventPublished(eventId: string): Promise<void> {
    await this.pool.query(
      `
        update upload_service.outbox_events
        set publish_status = 'published',
            published_at = now(),
            attempt_count = attempt_count + 1,
            last_error = null
        where event_id = $1
      `,
      [eventId],
    );
  }

  async markOutboxEventPublishFailed(eventId: string, errorMessage: string): Promise<void> {
    await this.pool.query(
      `
        update upload_service.outbox_events
        set attempt_count = attempt_count + 1,
            last_error = left($2, 1000)
        where event_id = $1
      `,
      [eventId, errorMessage],
    );
  }

  private async upsertFile(client: PoolClient, input: PersistUploadAndOutboxInput): Promise<void> {
    const command = input.command;
    const eventPayload = input.fileUploadedEvent.payload;

    await client.query(
      `
        insert into upload_service.files (
          file_id,
          tenant_id,
          user_id,
          file_name,
          content_type,
          size_bytes,
          bucket,
          object_key,
          upload_status,
          correlation_id,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, 'uploaded', $9, now(), now())
        on conflict (file_id)
        do update set
          tenant_id = excluded.tenant_id,
          user_id = excluded.user_id,
          file_name = excluded.file_name,
          content_type = excluded.content_type,
          size_bytes = excluded.size_bytes,
          bucket = excluded.bucket,
          object_key = excluded.object_key,
          upload_status = excluded.upload_status,
          correlation_id = excluded.correlation_id,
          updated_at = now()
      `,
      [
        command.payload.fileId,
        command.payload.tenantId ?? null,
        command.payload.userId ?? null,
        command.payload.fileName,
        command.payload.contentType,
        command.payload.sizeBytes,
        eventPayload.bucket,
        eventPayload.objectKey,
        command.correlationId,
      ],
    );
  }

  private async insertOutboxEvent(client: PoolClient, input: PersistUploadAndOutboxInput): Promise<void> {
    const event = input.fileUploadedEvent;
    const outboxHeaders = {
      kind: event.kind,
      type: event.type,
      version: event.version,
      correlationId: event.correlationId,
      causationId: event.causationId ?? null,
      producer: event.producer,
    };

    await client.query(
      `
        insert into upload_service.outbox_events (
          event_id,
          aggregate_type,
          aggregate_id,
          event_type,
          routing_key,
          payload,
          headers,
          occurred_at
        )
        values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::timestamptz)
        on conflict (event_id) do nothing
      `,
      [
        event.messageId,
        'file',
        event.payload.fileId,
        event.type,
        input.routingKey,
        JSON.stringify(event),
        JSON.stringify(outboxHeaders),
        event.occurredAt,
      ],
    );
  }
}
