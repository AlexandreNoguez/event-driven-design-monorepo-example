-- Outbox de produtores de eventos derivados de processamento
-- validator-service, thumbnail-service e extractor-service

create table if not exists validator_service.outbox_events (
  event_id text primary key,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  routing_key text not null,
  payload jsonb not null,
  headers jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  publish_status text not null default 'pending',
  published_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_validator_outbox_publish_status_created_at
  on validator_service.outbox_events (publish_status, created_at);

create index if not exists idx_validator_outbox_aggregate
  on validator_service.outbox_events (aggregate_type, aggregate_id);

create index if not exists idx_validator_outbox_event_type
  on validator_service.outbox_events (event_type);

create table if not exists thumbnail_service.outbox_events (
  event_id text primary key,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  routing_key text not null,
  payload jsonb not null,
  headers jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  publish_status text not null default 'pending',
  published_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_thumbnail_outbox_publish_status_created_at
  on thumbnail_service.outbox_events (publish_status, created_at);

create index if not exists idx_thumbnail_outbox_aggregate
  on thumbnail_service.outbox_events (aggregate_type, aggregate_id);

create index if not exists idx_thumbnail_outbox_event_type
  on thumbnail_service.outbox_events (event_type);

create table if not exists extractor_service.outbox_events (
  event_id text primary key,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  routing_key text not null,
  payload jsonb not null,
  headers jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  publish_status text not null default 'pending',
  published_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_extractor_outbox_publish_status_created_at
  on extractor_service.outbox_events (publish_status, created_at);

create index if not exists idx_extractor_outbox_aggregate
  on extractor_service.outbox_events (aggregate_type, aggregate_id);

create index if not exists idx_extractor_outbox_event_type
  on extractor_service.outbox_events (event_type);

