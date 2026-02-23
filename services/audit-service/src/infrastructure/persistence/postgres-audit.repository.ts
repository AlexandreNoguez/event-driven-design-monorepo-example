import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type {
  AuditRepositoryPort,
  StoreAuditableEventInput,
} from '../../application/audit/ports/audit-repository.port';

@Injectable()
export class PostgresAuditRepository implements AuditRepositoryPort, OnModuleDestroy {
  private readonly logger = new Logger(PostgresAuditRepository.name);
  private readonly pool: Pool;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for audit-service.');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
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

  async storeAuditableEvent(input: StoreAuditableEventInput): Promise<{ applied: boolean }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const insertedProcessed = await this.insertProcessedEvent(client, input);
      if (!insertedProcessed) {
        await client.query('ROLLBACK');
        return { applied: false };
      }

      await this.insertAuditEvent(client, input);
      await client.query('COMMIT');
      return { applied: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertProcessedEvent(client: PoolClient, input: StoreAuditableEventInput): Promise<boolean> {
    const result = await client.query(
      `
        insert into audit_service.processed_events (
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
        input.event.messageId,
        input.consumerName,
        input.event.correlationId,
        input.event.type,
        input.event.producer,
      ],
    );

    return (result.rowCount ?? 0) > 0;
  }

  private async insertAuditEvent(client: PoolClient, input: StoreAuditableEventInput): Promise<void> {
    await client.query(
      `
        insert into audit_service.audit_events (
          event_id,
          event_type,
          occurred_at,
          correlation_id,
          causation_id,
          producer,
          routing_key,
          payload_summary
        )
        values ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8::jsonb)
        on conflict (event_id) do nothing
      `,
      [
        input.event.messageId,
        input.event.type,
        input.event.occurredAt,
        input.event.correlationId,
        input.event.causationId ?? null,
        input.event.producer,
        input.routingKey ?? null,
        JSON.stringify(input.payloadSummary),
      ],
    );
  }
}
