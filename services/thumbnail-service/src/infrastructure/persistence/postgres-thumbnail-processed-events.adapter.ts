import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { Pool } from 'pg';
import type {
  MarkThumbnailProcessedEventInput,
  ThumbnailProcessedEventsPort,
} from '../../application/thumbnail/ports/thumbnail-processed-events.port';
import { ThumbnailServiceConfigService } from '../config/thumbnail-service-config.service';

@Injectable()
export class PostgresThumbnailProcessedEventsAdapter
  implements ThumbnailProcessedEventsPort, OnModuleDestroy
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
}
