# Postgres Ownership e Migrations (Item 3)

## Decisão de ownership (MVP local)

Decisão adotada para o MVP:

- `schema por serviço` em uma única instância Postgres local.

Motivos:

- reduz custo operacional no ambiente local (um único container)
- mantém separação lógica por serviço (`upload_service`, `projection_service`, etc.)
- facilita evolução futura para `DB por serviço` sem perder naming e limites de ownership

Trade-off aceito:

- isolamento operacional é menor do que `DB por serviço`, então a disciplina de acesso por schema deve ser respeitada pelo código dos serviços.

## Migrations criadas (baseline)

Local:

- `infra/postgres/migrations/0001_schema_strategy.sql`
- `infra/postgres/migrations/0010_upload_service_init.sql`
- `infra/postgres/migrations/0020_projection_service_init.sql`
- `infra/postgres/migrations/0030_audit_service_init.sql`
- `infra/postgres/migrations/0040_notification_service_init.sql`
- `infra/postgres/migrations/0050_processed_events_by_consumer.sql`

## Tabelas do checklist

### upload-service

- `upload_service.files`
- `upload_service.outbox_events`

### projection-service

- `projection_service.uploads_read`
- `projection_service.upload_steps_read`
- `projection_service.upload_timeline_read`

### audit-service

- `audit_service.audit_events`

### notification-service (opcional)

- `notification_service.notification_logs`

## Idempotência por consumer

Foram criadas tabelas `processed_events` por schema de consumer:

- `validator_service.processed_events`
- `thumbnail_service.processed_events`
- `extractor_service.processed_events`
- `projection_service.processed_events`
- `notification_service.processed_events`
- `audit_service.processed_events`

Chave primária:

- `(event_id, consumer_name)`

Campos mínimos atendidos do checklist:

- `event_id`
- `consumer_name`
- `processed_at`

Campos extras úteis adicionados:

- `correlation_id`
- `message_type`
- `source_producer`

## Execução (manual, quando o Postgres estiver no ar)

Exemplo com `psql`:

```bash
psql "$DATABASE_URL" -f infra/postgres/migrations/0001_schema_strategy.sql
psql "$DATABASE_URL" -f infra/postgres/migrations/0010_upload_service_init.sql
psql "$DATABASE_URL" -f infra/postgres/migrations/0020_projection_service_init.sql
psql "$DATABASE_URL" -f infra/postgres/migrations/0030_audit_service_init.sql
psql "$DATABASE_URL" -f infra/postgres/migrations/0040_notification_service_init.sql
psql "$DATABASE_URL" -f infra/postgres/migrations/0050_processed_events_by_consumer.sql
```

Observação:

- estas migrations estão em SQL puro como baseline arquitetural; quando o ORM for escolhido (Prisma/TypeORM), elas podem ser migradas para o formato oficial da stack.
