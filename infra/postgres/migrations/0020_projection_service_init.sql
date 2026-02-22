-- projection-service: read model para UIs

create table if not exists projection_service.uploads_read (
  file_id text primary key,
  tenant_id text,
  user_id text,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  source_bucket text,
  source_object_key text,
  correlation_id text not null,
  overall_status text not null default 'uploaded',
  validation_status text not null default 'pending',
  thumbnail_status text not null default 'pending',
  metadata_status text not null default 'pending',
  rejection_code text,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_uploads_read_user_created
  on projection_service.uploads_read (user_id, created_at desc);

create index if not exists idx_uploads_read_status
  on projection_service.uploads_read (overall_status);

create index if not exists idx_uploads_read_correlation
  on projection_service.uploads_read (correlation_id);

create table if not exists projection_service.upload_steps_read (
  file_id text not null references projection_service.uploads_read (file_id) on delete cascade,
  step_name text not null,
  step_status text not null,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  error_code text,
  error_message text,
  details jsonb not null default '{}'::jsonb,
  primary key (file_id, step_name)
);

create index if not exists idx_upload_steps_status
  on projection_service.upload_steps_read (step_status);

create table if not exists projection_service.upload_timeline_read (
  timeline_id bigserial primary key,
  file_id text not null,
  event_id text not null,
  event_type text not null,
  routing_key text,
  occurred_at timestamptz not null,
  correlation_id text not null,
  payload_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint upload_timeline_event_unique unique (event_id)
);

create index if not exists idx_upload_timeline_file_occurred
  on projection_service.upload_timeline_read (file_id, occurred_at asc);

create index if not exists idx_upload_timeline_correlation_occurred
  on projection_service.upload_timeline_read (correlation_id, occurred_at asc);
