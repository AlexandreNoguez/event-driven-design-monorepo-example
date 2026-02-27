import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { Pool, type PoolClient } from 'pg';
import type {
  MarkThumbnailProcessedEventInput,
  ThumbnailProcessedEventsPort,
} from '../../application/thumbnail/ports/thumbnail-processed-events.port';
import type {
  StoreThumbnailProcessedAndOutboxInput,
  ThumbnailOutboxPendingEvent,
  ThumbnailOutboxRepositoryPort,
} from '../../application/thumbnail/ports/thumbnail-outbox-repository.port';
import { ThumbnailServiceConfigService } from '../config/thumbnail-service-config.service';

interface ThumbnailOutboxRow {
  event_id: string;
  routing_key: string;
  attempt_count: number;
  payload: unknown;
}

@Injectable()
export class PostgresThumbnailProcessedEventsAdapter
  implements ThumbnailProcessedEventsPort, ThumbnailOutboxRepositoryPort, OnModuleDestroy
{
  private readonly logger = new Logger(PostgresThumbnailProcessedEventsAdapter.name);
  private readonly pool: Pool;

  constructor(config: ThumbnailServiceConfigService) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 10_000,
    });

    this.pool.on('error', (error: unknown) => {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'thumbnail-service',
        message: 'Postgres pool error in processed-events adapter.',
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
          from thumbnail_service.processed_events
          where event_id = $1
            and consumer_name = $2
        ) as exists
      `,
      [eventId, consumerName],
    );

    return Boolean(result.rows[0]?.exists);
  }

  async markProcessedEvent(input: MarkThumbnailProcessedEventInput): Promise<void> {
    await this.pool.query(
      `
        insert into thumbnail_service.processed_events (
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

  async storeProcessedEventAndOutbox(
    input: StoreThumbnailProcessedAndOutboxInput,
  ): Promise<{ applied: boolean }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const inserted = await this.insertProcessedEvent(client, input);
      if (!inserted) {
        await client.query('ROLLBACK');
        return { applied: false };
      }

      await this.insertOutboxEvent(client, input);
      await client.query('COMMIT');
      return { applied: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async findPendingOutboxEvents(limit: number): Promise<ThumbnailOutboxPendingEvent[]> {
    const result = await this.pool.query<ThumbnailOutboxRow>(
      `
        select event_id, routing_key, attempt_count, payload
        from thumbnail_service.outbox_events
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
          attemptCount: row.attempt_count,
          envelope: row.payload as ThumbnailOutboxPendingEvent['envelope'],
        };
      })
      .filter((row): row is ThumbnailOutboxPendingEvent => row !== undefined);
  }

  async markOutboxEventPublished(eventId: string): Promise<void> {
    await this.pool.query(
      `
        update thumbnail_service.outbox_events
        set publish_status = 'published',
            published_at = now(),
            attempt_count = attempt_count + 1,
            last_error = null
        where event_id = $1
      `,
      [eventId],
    );
  }

  async markOutboxEventPublishFailed(
    eventId: string,
    errorMessage: string,
    terminalFailure: boolean,
  ): Promise<void> {
    await this.pool.query(
      `
        update thumbnail_service.outbox_events
        set publish_status = case when $3 then 'failed' else publish_status end,
            attempt_count = attempt_count + 1,
            last_error = left($2, 1000)
        where event_id = $1
      `,
      [eventId, errorMessage, terminalFailure],
    );
  }

  private async insertProcessedEvent(
    client: PoolClient,
    input: StoreThumbnailProcessedAndOutboxInput,
  ): Promise<boolean> {
    const result = await client.query(
      `
        insert into thumbnail_service.processed_events (
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

    return (result.rowCount ?? 0) > 0;
  }

  private async insertOutboxEvent(
    client: PoolClient,
    input: StoreThumbnailProcessedAndOutboxInput,
  ): Promise<void> {
    const event = input.outboxEvent;

    const headers = {
      kind: event.kind,
      type: event.type,
      version: event.version,
      correlationId: event.correlationId,
      causationId: event.causationId ?? null,
      producer: event.producer,
    };

    await client.query(
      `
        insert into thumbnail_service.outbox_events (
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
        JSON.stringify(headers),
        event.occurredAt,
      ],
    );
  }
}
