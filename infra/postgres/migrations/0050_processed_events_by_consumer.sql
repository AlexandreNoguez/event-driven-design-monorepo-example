-- Idempotência por consumer: processed_events(event_id, consumer_name, processed_at)
-- Tabelas replicadas por schema de consumer para manter ownership local do serviço.

create table if not exists validator_service.processed_events (
  event_id text not null,
  consumer_name text not null,
  processed_at timestamptz not null default now(),
  correlation_id text,
  message_type text,
  source_producer text,
  primary key (event_id, consumer_name)
);

create index if not exists idx_validator_processed_events_processed_at
  on validator_service.processed_events (processed_at desc);

create table if not exists thumbnail_service.processed_events (
  event_id text not null,
  consumer_name text not null,
  processed_at timestamptz not null default now(),
  correlation_id text,
  message_type text,
  source_producer text,
  primary key (event_id, consumer_name)
);

create index if not exists idx_thumbnail_processed_events_processed_at
  on thumbnail_service.processed_events (processed_at desc);

create table if not exists extractor_service.processed_events (
  event_id text not null,
  consumer_name text not null,
  processed_at timestamptz not null default now(),
  correlation_id text,
  message_type text,
  source_producer text,
  primary key (event_id, consumer_name)
);

create index if not exists idx_extractor_processed_events_processed_at
  on extractor_service.processed_events (processed_at desc);

create table if not exists projection_service.processed_events (
  event_id text not null,
  consumer_name text not null,
  processed_at timestamptz not null default now(),
  correlation_id text,
  message_type text,
  source_producer text,
  primary key (event_id, consumer_name)
);

create index if not exists idx_projection_processed_events_processed_at
  on projection_service.processed_events (processed_at desc);

create table if not exists notification_service.processed_events (
  event_id text not null,
  consumer_name text not null,
  processed_at timestamptz not null default now(),
  correlation_id text,
  message_type text,
  source_producer text,
  primary key (event_id, consumer_name)
);

create index if not exists idx_notification_processed_events_processed_at
  on notification_service.processed_events (processed_at desc);

create table if not exists audit_service.processed_events (
  event_id text not null,
  consumer_name text not null,
  processed_at timestamptz not null default now(),
  correlation_id text,
  message_type text,
  source_producer text,
  primary key (event_id, consumer_name)
);

create index if not exists idx_audit_processed_events_processed_at
  on audit_service.processed_events (processed_at desc);
