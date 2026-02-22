-- notification-service: log de envios (opcional no MVP, criado desde já)

create table if not exists notification_service.notification_logs (
  notification_id bigserial primary key,
  event_id text not null,
  event_type text not null,
  file_id text,
  recipient text not null,
  channel text not null default 'email',
  template_key text not null,
  status text not null default 'pending',
  provider_message_id text,
  attempt_count integer not null default 0,
  correlation_id text not null,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_logs_event_recipient_unique unique (event_id, recipient, channel)
);

create index if not exists idx_notification_logs_status_created
  on notification_service.notification_logs (status, created_at desc);

create index if not exists idx_notification_logs_file_id
  on notification_service.notification_logs (file_id);

create index if not exists idx_notification_logs_correlation
  on notification_service.notification_logs (correlation_id);
