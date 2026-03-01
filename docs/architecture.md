# Architecture Overview

## Purpose

This repository implements an event-driven upload pipeline for portfolio demonstration.

The current MVP focuses on:

- local-first operability with Docker
- explicit message contracts and delivery guarantees
- tactical DDD boundaries in every backend service
- observable asynchronous processing

## Monorepo Layout

- `services/`
  - NestJS backends (`api-gateway`, `upload-service`, `validator-service`, `thumbnail-service`, `extractor-service`, `projection-service`, `notification-service`, `audit-service`)
- `packages/shared`
  - message envelopes, message catalog, routing-key standards, JSON logging helpers
- `infra/`
  - Docker Compose, RabbitMQ topology, Postgres migrations, MinIO bootstrap, Keycloak import
- `docs/`
  - architecture, events catalog, RabbitMQ topology, ADRs, saga roadmap
- `tests/`
  - root-level `node:test` unit tests and contract tests

## Runtime Topology

```mermaid
flowchart LR
  subgraph Clients
    User[user-web]
    Admin[admin-web]
  end

  subgraph Edge
    Gateway[api-gateway]
  end

  subgraph Broker
    MQ[(RabbitMQ)]
  end

  subgraph Workers
    Upload[upload-service]
    Validator[validator-service]
    Thumbnail[thumbnail-service]
    Extractor[extractor-service]
    Projection[projection-service]
    Notification[notification-service]
    Audit[audit-service]
  end

  subgraph Infrastructure
    PG[(Postgres)]
    S3[(MinIO)]
    KC[(Keycloak)]
    Mail[(Mailhog)]
  end

  User -->|HTTP + JWT| Gateway
  Admin -->|HTTP + JWT| Gateway
  Gateway -->|validate token| KC
  Gateway -->|presigned URL| S3
  Gateway -->|commands| MQ

  MQ --> Upload
  MQ --> Validator
  MQ --> Thumbnail
  MQ --> Extractor
  MQ --> Projection
  MQ --> Notification
  MQ --> Audit

  Upload --> PG
  Validator --> PG
  Thumbnail --> PG
  Extractor --> PG
  Projection --> PG
  Notification --> PG
  Audit --> PG

  Upload --> S3
  Validator --> S3
  Thumbnail --> S3
  Extractor --> S3
  Notification --> Mail
```

## Service Responsibilities

### `api-gateway`

- validates JWTs from Keycloak
- issues MinIO presigned upload URLs
- confirms uploaded objects before publishing `UploadRequested.v1`
- exposes admin operations for reprocess and DLQ re-drive

### `upload-service`

- consumes upload commands
- persists `upload_service.files`
- stores domain events in the outbox
- publishes `FileUploaded.v1`

### `validator-service`

- consumes `FileUploaded.v1`
- validates declared MIME type, object size, and binary signature
- publishes `FileValidated.v1` or `FileRejected.v1`

### `thumbnail-service`

- consumes `FileValidated.v1`
- generates a thumbnail for supported image formats
- stores thumbnails in MinIO
- publishes `ThumbnailGenerated.v1`

### `extractor-service`

- consumes `FileValidated.v1`
- extracts metadata (for example dimensions and checksums)
- publishes `MetadataExtracted.v1`

### `projection-service`

- consumes all relevant domain events from `q.projection`
- maintains the read model used by future frontends
- runs the explicit process manager used by the Saga
- publishes `ProcessingCompleted.v1`, `ProcessingFailed.v1`, and `ProcessingTimedOut.v1` through its outbox
- keeps the terminal-event cutover rollbackable through config

### `notification-service`

- consumes `ProcessingCompleted.v1` and `FileRejected.v1`
- sends e-mails through Mailhog SMTP
- persists notification delivery logs

### `audit-service`

- consumes all relevant domain events
- writes an immutable audit trail for debugging and traceability

## Current Happy-Path Flow

```mermaid
sequenceDiagram
  autonumber
  participant Client
  participant Gateway as api-gateway
  participant S3 as MinIO
  participant MQ as RabbitMQ
  participant Upload as upload-service
  participant Validator as validator-service
  participant Thumbnail as thumbnail-service
  participant Extractor as extractor-service
  participant Projection as projection-service
  participant Notification as notification-service
  participant Audit as audit-service

  Client->>Gateway: POST /uploads
  Gateway-->>Client: presigned PUT URL
  Client->>S3: PUT object
  Client->>Gateway: POST /uploads/:fileId/confirm
  Gateway->>MQ: UploadRequested.v1
  MQ->>Upload: UploadRequested.v1
  Upload->>MQ: FileUploaded.v1
  MQ->>Validator: FileUploaded.v1
  Validator->>MQ: FileValidated.v1
  MQ->>Thumbnail: FileValidated.v1
  MQ->>Extractor: FileValidated.v1
  Thumbnail->>MQ: ThumbnailGenerated.v1
  Extractor->>MQ: MetadataExtracted.v1
  MQ->>Projection: project all events
  Projection->>MQ: ProcessingCompleted.v1
  MQ->>Notification: ProcessingCompleted.v1
  MQ->>Audit: audit all events
```

## Failure Flow (Validation Rejection)

```mermaid
sequenceDiagram
  autonumber
  participant Gateway as api-gateway
  participant MQ as RabbitMQ
  participant Upload as upload-service
  participant Validator as validator-service
  participant Projection as projection-service
  participant Notification as notification-service
  participant Audit as audit-service

  Gateway->>MQ: UploadRequested.v1
  MQ->>Upload: UploadRequested.v1
  Upload->>MQ: FileUploaded.v1
  MQ->>Validator: FileUploaded.v1
  Validator->>MQ: FileRejected.v1
  MQ->>Projection: FileRejected.v1
  MQ->>Notification: FileRejected.v1
  MQ->>Audit: FileUploaded.v1 + FileRejected.v1
```

## Data Ownership

The local MVP uses a single Postgres instance with schema ownership per service.

- `upload_service`
  - `files`
  - `outbox_events`
- `projection_service`
  - `uploads_read`
  - `upload_steps_read`
  - `upload_timeline_read`
  - `outbox_events`
- `notification_service`
  - `notification_logs`
  - `processed_events`
- `audit_service`
  - `audit_events`
- `validator_service`, `thumbnail_service`, `extractor_service`
  - `processed_events`
- `processing_manager`
  - `processing_sagas`
  - `processed_events`

This keeps the portfolio environment simple while preserving explicit ownership boundaries.

## Messaging and Reliability

### Exchanges

- `domain.commands`
- `domain.events`

### Reliability mechanisms

- outbox on event-producing services
- consumer-side idempotency via `processed_events`
- retry policy based on RabbitMQ `x-death`
- explicit DLQ parking per queue
- admin re-drive with AMQP confirm before DLQ `ack`

## Tactical DDD Boundaries

Each backend service follows the same structure:

- `domain`
  - business rules, value decisions, pure mapping logic
- `application`
  - use cases and port definitions
- `infrastructure`
  - concrete adapters (Postgres, RabbitMQ, MinIO, Keycloak)
- `presentation`
  - HTTP controllers, AMQP consumers, background workers

This keeps infrastructure concerns out of domain logic and improves testability.

## Shadow Process Manager (Saga Preparation)

The project already documents a future Saga evolution in `docs/saga.md`.

The current implementation now includes an explicit **process manager** inside `projection-service`:

- it consumes the same projectable events already handled by the read model
- it stores saga state in `processing_manager.processing_sagas`
- it keeps its own idempotency table in `processing_manager.processed_events`
- it publishes terminal events through the existing projection outbox
- it compares the calculated terminal state with the observed terminal event stream for consistency tracking

Current cutover model:

- the read model still projects terminal events, but it no longer decides when to emit them
- terminal publication is now owned by the process manager
- the cutover can be reverted with `PROJECTION_PROCESS_MANAGER_PUBLISH_TERMINAL_EVENTS=false`

This keeps the runtime simple while making Saga ownership explicit.

## Testing Strategy

Current baseline:

- root-level unit tests with `node:test`
- contract test validating every JSON example in `docs/events/examples`
- Docker E2E happy path: `pnpm smoke`
- Docker E2E rejected path: `pnpm smoke:rejected`
- Docker E2E timeout path: `pnpm smoke:timeout`
- combined Docker E2E suite: `pnpm test:e2e`

## Known Next Steps

- implement a dedicated read/query surface for the process manager if operational visibility becomes necessary
- build `user-web` and `admin-web` on top of the existing read model
