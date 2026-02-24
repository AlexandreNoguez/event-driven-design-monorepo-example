-- projection-service: outbox para ProcessingCompleted.v1 (publisher desacoplado)

create table if not exists projection_service.outbox_events (
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

create index if not exists idx_projection_outbox_publish_status_created_at
  on projection_service.outbox_events (publish_status, created_at);

create index if not exists idx_projection_outbox_aggregate
  on projection_service.outbox_events (aggregate_type, aggregate_id);

create index if not exists idx_projection_outbox_event_type
  on projection_service.outbox_events (event_type);
