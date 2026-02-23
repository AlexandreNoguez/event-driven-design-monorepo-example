import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import type { ProcessingCompletedPayload } from '@event-pipeline/shared';
import {
  buildTimelineSummary,
  getEventFileId,
  type ProjectableDomainEvent,
} from '../../domain/projection/projectable-event';
import type {
  ProjectEventInput,
  ProjectionProjectorPort,
} from '../../application/projection/ports/projection-projector.port';
import { ProjectionServiceConfigService } from '../config/projection-service-config.service';

interface UploadsReadRow {
  file_id: string;
  user_id: string | null;
  tenant_id: string | null;
  validation_status: string;
  thumbnail_status: string;
  metadata_status: string;
  overall_status: string;
}

@Injectable()
export class PostgresProjectionProjectorAdapter implements ProjectionProjectorPort, OnModuleDestroy {
  private readonly logger = new Logger(PostgresProjectionProjectorAdapter.name);
  private readonly pool: Pool;

  constructor(config: ProjectionServiceConfigService) {
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

  async projectEvent(input: ProjectEventInput): Promise<{
    applied: boolean;
    processingCompletedSignal?: ProcessingCompletedPayload;
  }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const inserted = await this.insertProcessedEvent(client, input);
      if (!inserted) {
        await client.query('ROLLBACK');
        return { applied: false };
      }

      await this.ensureUploadReadRow(client, input.event);
      await this.applyEventProjection(client, input.event);
      const processingCompletedSignal = await this.maybeBuildProcessingCompletedSignal(client, input.event);
      await this.upsertTimeline(client, input.event, input.routingKey);

      await client.query('COMMIT');
      return { applied: true, processingCompletedSignal };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertProcessedEvent(client: PoolClient, input: ProjectEventInput): Promise<boolean> {
    const result = await client.query(
      `
        insert into projection_service.processed_events (
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

  private async ensureUploadReadRow(client: PoolClient, event: ProjectableDomainEvent): Promise<void> {
    const fileId = getEventFileId(event);

    const defaultFileName = event.type === 'FileUploaded.v1' ? event.payload.fileName : '(unknown)';
    const defaultContentType =
      event.type === 'FileUploaded.v1' || event.type === 'FileValidated.v1'
        ? event.payload.contentType
        : 'application/octet-stream';
    const defaultSizeBytes =
      event.type === 'FileUploaded.v1' || event.type === 'FileValidated.v1'
        ? event.payload.sizeBytes
        : 0;

    const sourceBucket =
      event.type === 'FileUploaded.v1' || event.type === 'FileValidated.v1' || event.type === 'FileRejected.v1'
        ? event.payload.bucket
        : null;
    const sourceObjectKey =
      event.type === 'FileUploaded.v1' || event.type === 'FileValidated.v1' || event.type === 'FileRejected.v1'
        ? event.payload.objectKey
        : null;

    const userId = 'userId' in event.payload ? (event.payload.userId ?? null) : null;
    const tenantId = 'tenantId' in event.payload ? (event.payload.tenantId ?? null) : null;

    await client.query(
      `
        insert into projection_service.uploads_read (
          file_id,
          tenant_id,
          user_id,
          file_name,
          content_type,
          size_bytes,
          source_bucket,
          source_object_key,
          correlation_id,
          overall_status,
          validation_status,
          thumbnail_status,
          metadata_status,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'processing', 'pending', 'pending', 'pending', now(), now())
        on conflict (file_id) do nothing
      `,
      [
        fileId,
        tenantId,
        userId,
        defaultFileName,
        defaultContentType,
        defaultSizeBytes,
        sourceBucket,
        sourceObjectKey,
        event.correlationId,
      ],
    );
  }

  private async applyEventProjection(client: PoolClient, event: ProjectableDomainEvent): Promise<void> {
    switch (event.type) {
      case 'FileUploaded.v1':
        await this.applyFileUploaded(client, event);
        return;
      case 'FileValidated.v1':
        await this.applyFileValidated(client, event);
        return;
      case 'FileRejected.v1':
        await this.applyFileRejected(client, event);
        return;
      case 'ThumbnailGenerated.v1':
        await this.applyThumbnailGenerated(client, event);
        return;
      case 'MetadataExtracted.v1':
        await this.applyMetadataExtracted(client, event);
        return;
      case 'ProcessingCompleted.v1':
        await this.applyProcessingCompleted(client, event);
        return;
    }
  }

  private async applyFileUploaded(
    client: PoolClient,
    event: Extract<ProjectableDomainEvent, { type: 'FileUploaded.v1' }>,
  ): Promise<void> {
    await client.query(
      `
        update projection_service.uploads_read
        set tenant_id = coalesce($2, tenant_id),
            user_id = coalesce($3, user_id),
            file_name = $4,
            content_type = $5,
            size_bytes = $6,
            source_bucket = $7,
            source_object_key = $8,
            correlation_id = $9,
            overall_status = case
              when overall_status in ('completed', 'rejected', 'failed') then overall_status
              else 'uploaded'
            end,
            validation_status = coalesce(nullif(validation_status, ''), 'pending'),
            thumbnail_status = coalesce(nullif(thumbnail_status, ''), 'pending'),
            metadata_status = coalesce(nullif(metadata_status, ''), 'pending'),
            updated_at = now()
        where file_id = $1
      `,
      [
        event.payload.fileId,
        event.payload.tenantId ?? null,
        event.payload.userId ?? null,
        event.payload.fileName,
        event.payload.contentType,
        event.payload.sizeBytes,
        event.payload.bucket,
        event.payload.objectKey,
        event.correlationId,
      ],
    );

    await this.upsertStep(client, {
      fileId: event.payload.fileId,
      stepName: 'upload',
      stepStatus: 'completed',
      finishedAt: event.occurredAt,
      details: {
        bucket: event.payload.bucket,
        objectKey: event.payload.objectKey,
      },
    });

    await this.upsertStep(client, { fileId: event.payload.fileId, stepName: 'validation', stepStatus: 'pending' });
    await this.upsertStep(client, { fileId: event.payload.fileId, stepName: 'thumbnail', stepStatus: 'pending' });
    await this.upsertStep(client, { fileId: event.payload.fileId, stepName: 'metadata', stepStatus: 'pending' });

    await this.recomputeOverallStatus(client, event.payload.fileId);
  }

  private async applyFileValidated(
    client: PoolClient,
    event: Extract<ProjectableDomainEvent, { type: 'FileValidated.v1' }>,
  ): Promise<void> {
    await client.query(
      `
        update projection_service.uploads_read
        set tenant_id = coalesce($2, tenant_id),
            user_id = coalesce($3, user_id),
            content_type = $4,
            size_bytes = $5,
            source_bucket = $6,
            source_object_key = $7,
            validation_status = 'completed',
            rejection_code = null,
            rejection_reason = null,
            updated_at = now()
        where file_id = $1
      `,
      [
        event.payload.fileId,
        event.payload.tenantId ?? null,
        event.payload.userId ?? null,
        event.payload.contentType,
        event.payload.sizeBytes,
        event.payload.bucket,
        event.payload.objectKey,
      ],
    );

    await this.upsertStep(client, {
      fileId: event.payload.fileId,
      stepName: 'validation',
      stepStatus: 'completed',
      finishedAt: event.occurredAt,
      details: {
        checksum: event.payload.checksum,
      },
    });

    await this.recomputeOverallStatus(client, event.payload.fileId);
  }

  private async applyFileRejected(
    client: PoolClient,
    event: Extract<ProjectableDomainEvent, { type: 'FileRejected.v1' }>,
  ): Promise<void> {
    await client.query(
      `
        update projection_service.uploads_read
        set tenant_id = coalesce($2, tenant_id),
            user_id = coalesce($3, user_id),
            source_bucket = coalesce($4, source_bucket),
            source_object_key = coalesce($5, source_object_key),
            overall_status = 'rejected',
            validation_status = 'failed',
            thumbnail_status = case when thumbnail_status = 'completed' then thumbnail_status else 'skipped' end,
            metadata_status = case when metadata_status = 'completed' then metadata_status else 'skipped' end,
            rejection_code = $6,
            rejection_reason = $7,
            updated_at = now()
        where file_id = $1
      `,
      [
        event.payload.fileId,
        event.payload.tenantId ?? null,
        event.payload.userId ?? null,
        event.payload.bucket,
        event.payload.objectKey,
        event.payload.code,
        event.payload.reason,
      ],
    );

    await this.upsertStep(client, {
      fileId: event.payload.fileId,
      stepName: 'validation',
      stepStatus: 'failed',
      finishedAt: event.occurredAt,
      errorCode: event.payload.code,
      errorMessage: event.payload.reason,
      details: {
        code: event.payload.code,
        reason: event.payload.reason,
      },
    });

    await this.upsertStep(client, {
      fileId: event.payload.fileId,
      stepName: 'thumbnail',
      stepStatus: 'skipped',
      errorCode: 'UPSTREAM_REJECTED',
      errorMessage: 'Skipped because validation failed.',
    });
    await this.upsertStep(client, {
      fileId: event.payload.fileId,
      stepName: 'metadata',
      stepStatus: 'skipped',
      errorCode: 'UPSTREAM_REJECTED',
      errorMessage: 'Skipped because validation failed.',
    });
  }

  private async applyThumbnailGenerated(
    client: PoolClient,
    event: Extract<ProjectableDomainEvent, { type: 'ThumbnailGenerated.v1' }>,
  ): Promise<void> {
    await client.query(
      `
        update projection_service.uploads_read
        set tenant_id = coalesce($2, tenant_id),
            user_id = coalesce($3, user_id),
            thumbnail_status = 'completed',
            updated_at = now()
        where file_id = $1
      `,
      [event.payload.fileId, event.payload.tenantId ?? null, event.payload.userId ?? null],
    );

    await this.upsertStep(client, {
      fileId: event.payload.fileId,
      stepName: 'thumbnail',
      stepStatus: 'completed',
      finishedAt: event.occurredAt,
      details: {
        thumbnailBucket: event.payload.thumbnailBucket,
        thumbnailObjectKey: event.payload.thumbnailObjectKey,
        width: event.payload.width,
        height: event.payload.height,
      },
    });

    await this.recomputeOverallStatus(client, event.payload.fileId);
  }

  private async applyMetadataExtracted(
    client: PoolClient,
    event: Extract<ProjectableDomainEvent, { type: 'MetadataExtracted.v1' }>,
  ): Promise<void> {
    await client.query(
      `
        update projection_service.uploads_read
        set tenant_id = coalesce($2, tenant_id),
            user_id = coalesce($3, user_id),
            metadata_status = 'completed',
            updated_at = now()
        where file_id = $1
      `,
      [event.payload.fileId, event.payload.tenantId ?? null, event.payload.userId ?? null],
    );

    await this.upsertStep(client, {
      fileId: event.payload.fileId,
      stepName: 'metadata',
      stepStatus: 'completed',
      finishedAt: event.occurredAt,
      details: event.payload.metadata,
    });

    await this.recomputeOverallStatus(client, event.payload.fileId);
  }

  private async applyProcessingCompleted(
    client: PoolClient,
    event: Extract<ProjectableDomainEvent, { type: 'ProcessingCompleted.v1' }>,
  ): Promise<void> {
    await client.query(
      `
        update projection_service.uploads_read
        set tenant_id = coalesce($2, tenant_id),
            user_id = coalesce($3, user_id),
            overall_status = $4,
            updated_at = now()
        where file_id = $1
      `,
      [
        event.payload.fileId,
        event.payload.tenantId ?? null,
        event.payload.userId ?? null,
        event.payload.status === 'completed' ? 'completed' : 'failed',
      ],
    );

    await this.upsertStep(client, {
      fileId: event.payload.fileId,
      stepName: 'processing',
      stepStatus: event.payload.status === 'completed' ? 'completed' : 'failed',
      finishedAt: event.occurredAt,
      details: {
        completedSteps: event.payload.completedSteps,
      },
    });
  }

  private async upsertTimeline(
    client: PoolClient,
    event: ProjectableDomainEvent,
    routingKey?: string,
  ): Promise<void> {
    const summary = buildTimelineSummary(event);

    await client.query(
      `
        insert into projection_service.upload_timeline_read (
          file_id,
          event_id,
          event_type,
          routing_key,
          occurred_at,
          correlation_id,
          payload_summary
        )
        values ($1, $2, $3, $4, $5::timestamptz, $6, $7::jsonb)
        on conflict (event_id) do nothing
      `,
      [
        summary.fileId,
        event.messageId,
        event.type,
        routingKey ?? null,
        event.occurredAt,
        event.correlationId,
        JSON.stringify(summary.payloadSummary),
      ],
    );
  }

  private async upsertStep(
    client: PoolClient,
    input: {
      fileId: string;
      stepName: string;
      stepStatus: string;
      finishedAt?: string;
      errorCode?: string;
      errorMessage?: string;
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    await client.query(
      `
        insert into projection_service.upload_steps_read (
          file_id,
          step_name,
          step_status,
          started_at,
          finished_at,
          updated_at,
          error_code,
          error_message,
          details
        )
        values ($1, $2, $3, coalesce($4::timestamptz, now()), $5::timestamptz, now(), $6, $7, $8::jsonb)
        on conflict (file_id, step_name)
        do update set
          step_status = excluded.step_status,
          started_at = coalesce(projection_service.upload_steps_read.started_at, excluded.started_at),
          finished_at = coalesce(excluded.finished_at, projection_service.upload_steps_read.finished_at),
          updated_at = now(),
          error_code = excluded.error_code,
          error_message = excluded.error_message,
          details = case
            when excluded.details = '{}'::jsonb then projection_service.upload_steps_read.details
            else excluded.details
          end
      `,
      [
        input.fileId,
        input.stepName,
        input.stepStatus,
        input.finishedAt ?? null,
        input.finishedAt ?? null,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        JSON.stringify(input.details ?? {}),
      ],
    );
  }

  private async recomputeOverallStatus(client: PoolClient, fileId: string): Promise<void> {
    const result = await client.query<UploadsReadRow>(
      `
        select validation_status, thumbnail_status, metadata_status, overall_status
        from projection_service.uploads_read
        where file_id = $1
      `,
      [fileId],
    );

    const row = result.rows[0];
    if (!row) {
      return;
    }

    let nextOverallStatus = row.overall_status;

    if (row.overall_status === 'rejected' || row.overall_status === 'failed') {
      return;
    }

    if (row.validation_status === 'failed') {
      nextOverallStatus = 'rejected';
    } else if (
      row.validation_status === 'completed' &&
      row.thumbnail_status === 'completed' &&
      row.metadata_status === 'completed'
    ) {
      nextOverallStatus = 'completed';
    } else if (row.validation_status === 'pending' && row.overall_status === 'uploaded') {
      nextOverallStatus = 'uploaded';
    } else {
      nextOverallStatus = 'processing';
    }

    await client.query(
      `
        update projection_service.uploads_read
        set overall_status = $2,
            updated_at = now()
        where file_id = $1
      `,
      [fileId, nextOverallStatus],
    );
  }

  private async maybeBuildProcessingCompletedSignal(
    client: PoolClient,
    event: ProjectableDomainEvent,
  ): Promise<ProcessingCompletedPayload | undefined> {
    if (event.type === 'ProcessingCompleted.v1' || event.type === 'FileRejected.v1') {
      return undefined;
    }

    const result = await client.query<UploadsReadRow>(
      `
        select
          file_id,
          user_id,
          tenant_id,
          validation_status,
          thumbnail_status,
          metadata_status,
          overall_status
        from projection_service.uploads_read
        where file_id = $1
      `,
      [getEventFileId(event)],
    );

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    if (row.overall_status !== 'completed') {
      return undefined;
    }

    if (
      row.validation_status !== 'completed' ||
      row.thumbnail_status !== 'completed' ||
      row.metadata_status !== 'completed'
    ) {
      return undefined;
    }

    return {
      fileId: row.file_id,
      userId: row.user_id ?? undefined,
      tenantId: row.tenant_id ?? undefined,
      status: 'completed',
      completedSteps: ['upload', 'validation', 'thumbnail', 'metadata'],
    };
  }
}
