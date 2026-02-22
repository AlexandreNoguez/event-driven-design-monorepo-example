-- Item 3 (Postgres): estratégia de ownership para o MVP local
-- Decisão: 1 instância Postgres + schema por serviço.
-- Motivo: reduz custo operacional no ambiente local sem perder separação lógica.

create schema if not exists upload_service;
create schema if not exists projection_service;
create schema if not exists audit_service;
create schema if not exists notification_service;
create schema if not exists validator_service;
create schema if not exists thumbnail_service;
create schema if not exists extractor_service;

comment on schema upload_service is 'Write model do upload-service (files + outbox)';
comment on schema projection_service is 'Read model do projection-service';
comment on schema audit_service is 'Audit log imutável';
comment on schema notification_service is 'Logs de notificação';
comment on schema validator_service is 'Consumer state (idempotência) do validator-service';
comment on schema thumbnail_service is 'Consumer state (idempotência) do thumbnail-service';
comment on schema extractor_service is 'Consumer state (idempotência) do extractor-service';
