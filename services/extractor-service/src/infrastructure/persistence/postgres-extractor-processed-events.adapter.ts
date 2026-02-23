import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import type {
  ExtractorProcessedEventsPort,
  MarkExtractorProcessedEventInput,
} from '../../application/extractor/ports/extractor-processed-events.port';
import { ExtractorServiceConfigService } from '../config/extractor-service-config.service';

@Injectable()
export class PostgresExtractorProcessedEventsAdapter
  implements ExtractorProcessedEventsPort, OnModuleDestroy
{
  private readonly logger = new Logger(PostgresExtractorProcessedEventsAdapter.name);
  private readonly pool: Pool;

  constructor(config: ExtractorServiceConfigService) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 10_000,
    });

    this.pool.on('error', (error: unknown) => {
      this.logger.error(
        `Postgres pool error: ${error instanceof Error ? error.message : String(error)}`,
      );
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
          from extractor_service.processed_events
          where event_id = $1
            and consumer_name = $2
        ) as exists
      `,
      [eventId, consumerName],
    );

    return Boolean(result.rows[0]?.exists);
  }

  async markProcessedEvent(input: MarkExtractorProcessedEventInput): Promise<void> {
    await this.pool.query(
      `
        insert into extractor_service.processed_events (
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
