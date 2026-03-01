-- processing-manager (shadow mode inside projection-service): saga state tracking without publishing terminal events

create schema if not exists processing_manager;

comment on schema processing_manager is 'Shadow process manager state for saga tracking';

create table if not exists processing_manager.processing_sagas (
  saga_id text primary key,
  file_id text not null,
  correlation_id text not null,
  status text not null,
  comparison_status text not null default 'pending',
  started_at timestamptz not null,
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  deadline_at timestamptz not null,
  validation_completed_at timestamptz,
  thumbnail_completed_at timestamptz,
  metadata_completed_at timestamptz,
  rejected_at timestamptz,
  timed_out_at timestamptz,
  rejection_code text,
  rejection_reason text,
  projection_completion_status text,
  projection_completion_observed_at timestamptz,
  last_event_id text not null,
  last_event_type text not null,
  last_event_occurred_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint processing_sagas_file_correlation_unique unique (file_id, correlation_id)
);

create index if not exists idx_processing_sagas_status_updated
  on processing_manager.processing_sagas (status, updated_at desc);

create index if not exists idx_processing_sagas_deadline
  on processing_manager.processing_sagas (deadline_at)
  where status not in ('completed', 'failed', 'timed-out');

create index if not exists idx_processing_sagas_file
  on processing_manager.processing_sagas (file_id);

create index if not exists idx_processing_sagas_correlation
  on processing_manager.processing_sagas (correlation_id);

create table if not exists processing_manager.processed_events (
  event_id text not null,
  consumer_name text not null,
  processed_at timestamptz not null default now(),
  correlation_id text,
  message_type text,
  source_producer text,
  primary key (event_id, consumer_name)
);

create index if not exists idx_processing_manager_processed_events_processed_at
  on processing_manager.processed_events (processed_at desc);
