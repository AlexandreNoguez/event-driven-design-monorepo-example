-- audit-service: trilha imutável de eventos

create table if not exists audit_service.audit_events (
  audit_id bigserial primary key,
  event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  correlation_id text not null,
  causation_id text,
  producer text not null,
  routing_key text,
  payload_summary jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  constraint audit_events_event_unique unique (event_id)
);

create index if not exists idx_audit_events_occurred
  on audit_service.audit_events (occurred_at desc);

create index if not exists idx_audit_events_correlation
  on audit_service.audit_events (correlation_id);

create index if not exists idx_audit_events_type
  on audit_service.audit_events (event_type);
