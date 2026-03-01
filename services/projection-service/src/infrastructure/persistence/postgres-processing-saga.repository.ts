import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createJsonLogEntry } from '@event-pipeline/shared';
import { Pool, type PoolClient } from 'pg';
import type {
  ProcessingSagaRepositoryPort,
  TimedOutProcessingSaga,
  TrackProcessingSagaInput,
  TrackProcessingSagaResult,
} from '../../application/process-manager/ports/processing-saga-repository.port';
import {
  applyProcessingSagaEvent,
  markProcessingSagaTimedOut,
  type ProcessingSagaState,
} from '../../domain/process-manager/processing-saga';
import { ProjectionServiceConfigService } from '../config/projection-service-config.service';

interface ProcessingSagaRow {
  saga_id: string;
  file_id: string;
  correlation_id: string;
  status: ProcessingSagaState['status'];
  comparison_status: ProcessingSagaState['comparisonStatus'];
  started_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  deadline_at: Date;
  validation_completed_at: Date | null;
  thumbnail_completed_at: Date | null;
  metadata_completed_at: Date | null;
  rejected_at: Date | null;
  timed_out_at: Date | null;
  rejection_code: string | null;
  rejection_reason: string | null;
  projection_completion_status: 'completed' | 'failed' | null;
  projection_completion_observed_at: Date | null;
  last_event_id: string;
  last_event_type: string;
  last_event_occurred_at: Date;
  metadata: Record<string, unknown> | null;
}

@Injectable()
export class PostgresProcessingSagaRepository implements ProcessingSagaRepositoryPort, OnModuleDestroy {
  private readonly logger = new Logger(PostgresProcessingSagaRepository.name);
  private readonly pool: Pool;

  constructor(config: ProjectionServiceConfigService) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 10_000,
    });

    this.pool.on('error', (error: unknown) => {
      this.logger.error(JSON.stringify(createJsonLogEntry({
        level: 'error',
        service: 'projection-service',
        message: 'Postgres pool error in processing saga repository.',
        correlationId: 'system',
        error,
      })));
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async trackEvent(input: TrackProcessingSagaInput): Promise<TrackProcessingSagaResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const inserted = await this.insertProcessedEvent(client, input);
      if (!inserted) {
        await client.query('ROLLBACK');
        return { applied: false };
      }

      const current = await this.findSagaForUpdate(client, input.event.payload.fileId, input.event.correlationId);
      const next = applyProcessingSagaEvent({
        current,
        event: input.event,
        timeoutMs: input.timeoutMs,
      });

      await this.upsertSaga(client, next);

      await client.query('COMMIT');
      return {
        applied: true,
        sagaState: next,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async markTimedOutSagas(now: string): Promise<TimedOutProcessingSaga[]> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query<ProcessingSagaRow>(
        `
          select *
          from processing_manager.processing_sagas
          where status not in ('completed', 'failed', 'timed-out')
            and deadline_at <= $1::timestamptz
          for update
        `,
        [now],
      );

      const timedOut: TimedOutProcessingSaga[] = [];

      for (const row of result.rows) {
        const current = mapRowToState(row);
        const next = markProcessingSagaTimedOut(current, now);
        await this.upsertSaga(client, next);
        timedOut.push({
          sagaId: next.sagaId,
          fileId: next.fileId,
          correlationId: next.correlationId,
          status: next.status,
          comparisonStatus: next.comparisonStatus,
        });
      }

      await client.query('COMMIT');
      return timedOut;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertProcessedEvent(
    client: PoolClient,
    input: TrackProcessingSagaInput,
  ): Promise<boolean> {
    const result = await client.query(
      `
        insert into processing_manager.processed_events (
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

  private async findSagaForUpdate(
    client: PoolClient,
    fileId: string,
    correlationId: string,
  ): Promise<ProcessingSagaState | undefined> {
    const result = await client.query<ProcessingSagaRow>(
      `
        select *
        from processing_manager.processing_sagas
        where file_id = $1
          and correlation_id = $2
        limit 1
        for update
      `,
      [fileId, correlationId],
    );

    const row = result.rows[0];
    return row ? mapRowToState(row) : undefined;
  }

  private async upsertSaga(client: PoolClient, state: ProcessingSagaState): Promise<void> {
    await client.query(
      `
        insert into processing_manager.processing_sagas (
          saga_id,
          file_id,
          correlation_id,
          status,
          comparison_status,
          started_at,
          updated_at,
          completed_at,
          deadline_at,
          validation_completed_at,
          thumbnail_completed_at,
          metadata_completed_at,
          rejected_at,
          timed_out_at,
          rejection_code,
          rejection_reason,
          projection_completion_status,
          projection_completion_observed_at,
          last_event_id,
          last_event_type,
          last_event_occurred_at,
          metadata
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22::jsonb
        )
        on conflict (saga_id) do update
        set status = excluded.status,
            comparison_status = excluded.comparison_status,
            updated_at = excluded.updated_at,
            completed_at = excluded.completed_at,
            deadline_at = excluded.deadline_at,
            validation_completed_at = excluded.validation_completed_at,
            thumbnail_completed_at = excluded.thumbnail_completed_at,
            metadata_completed_at = excluded.metadata_completed_at,
            rejected_at = excluded.rejected_at,
            timed_out_at = excluded.timed_out_at,
            rejection_code = excluded.rejection_code,
            rejection_reason = excluded.rejection_reason,
            projection_completion_status = excluded.projection_completion_status,
            projection_completion_observed_at = excluded.projection_completion_observed_at,
            last_event_id = excluded.last_event_id,
            last_event_type = excluded.last_event_type,
            last_event_occurred_at = excluded.last_event_occurred_at,
            metadata = excluded.metadata
      `,
      [
        state.sagaId,
        state.fileId,
        state.correlationId,
        state.status,
        state.comparisonStatus,
        state.startedAt,
        state.updatedAt,
        state.completedAt ?? null,
        state.deadlineAt,
        state.validationCompletedAt ?? null,
        state.thumbnailCompletedAt ?? null,
        state.metadataCompletedAt ?? null,
        state.rejectedAt ?? null,
        state.timedOutAt ?? null,
        state.rejectionCode ?? null,
        state.rejectionReason ?? null,
        state.projectionCompletionStatus ?? null,
        state.projectionCompletionObservedAt ?? null,
        state.lastEventId,
        state.lastEventType,
        state.lastEventOccurredAt,
        JSON.stringify(state.metadata),
      ],
    );
  }
}

function mapRowToState(row: ProcessingSagaRow): ProcessingSagaState {
  return {
    sagaId: row.saga_id,
    fileId: row.file_id,
    correlationId: row.correlation_id,
    status: row.status,
    comparisonStatus: row.comparison_status,
    startedAt: row.started_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at?.toISOString() ?? undefined,
    deadlineAt: row.deadline_at.toISOString(),
    validationCompletedAt: row.validation_completed_at?.toISOString() ?? undefined,
    thumbnailCompletedAt: row.thumbnail_completed_at?.toISOString() ?? undefined,
    metadataCompletedAt: row.metadata_completed_at?.toISOString() ?? undefined,
    rejectedAt: row.rejected_at?.toISOString() ?? undefined,
    timedOutAt: row.timed_out_at?.toISOString() ?? undefined,
    rejectionCode: row.rejection_code ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    projectionCompletionStatus: row.projection_completion_status ?? undefined,
    projectionCompletionObservedAt: row.projection_completion_observed_at?.toISOString() ?? undefined,
    lastEventId: row.last_event_id,
    lastEventType: row.last_event_type,
    lastEventOccurredAt: row.last_event_occurred_at.toISOString(),
    metadata: row.metadata ?? {},
  };
}
