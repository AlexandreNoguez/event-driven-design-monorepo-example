-- upload-service: files + outbox_events

create table if not exists upload_service.files (
  file_id text primary key,
  tenant_id text,
  user_id text,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  bucket text not null,
  object_key text not null,
  upload_status text not null default 'uploaded',
  correlation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint files_object_location_unique unique (bucket, object_key)
);

create index if not exists idx_upload_files_user_id
  on upload_service.files (user_id);

create index if not exists idx_upload_files_created_at
  on upload_service.files (created_at desc);

create index if not exists idx_upload_files_correlation_id
  on upload_service.files (correlation_id);

create table if not exists upload_service.outbox_events (
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

create index if not exists idx_outbox_publish_status_created_at
  on upload_service.outbox_events (publish_status, created_at);

create index if not exists idx_outbox_aggregate
  on upload_service.outbox_events (aggregate_type, aggregate_id);

create index if not exists idx_outbox_event_type
  on upload_service.outbox_events (event_type);
