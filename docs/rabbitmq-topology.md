# RabbitMQ Topologia, Retry e DLQ (Item 4)

## Visão geral

A topologia do RabbitMQ é importada automaticamente apos o startup do broker via service `rabbitmq-init`:

- `infra/rabbitmq/definitions.json`
- `infra/rabbitmq/import-definitions.sh`

O arquivo de definitions cria:

- exchanges principais (`domain.events`, `domain.commands`)
- filas do MVP (`q.upload.commands`, `q.validator`, `q.thumbnail`, `q.extractor`, `q.projection`, `q.notification`, `q.audit`)
- exchanges/filas de `retry` e `DLQ` por fila

## Exchanges principais

- `domain.events` (`topic`)
- `domain.commands` (`topic`)

## Filas e binds (MVP)

- `q.upload.commands` <- `domain.commands` com `commands.upload.#`, `commands.file.reprocess.*`
- `q.validator` <- `domain.events` com `files.uploaded.*`
- `q.thumbnail` <- `domain.events` com `files.validated.*`
- `q.extractor` <- `domain.events` com `files.validated.*`
- `q.projection` <- `domain.events` com `#`
- `q.notification` <- `domain.events` com `processing.#`, `files.rejected.*`
- `q.audit` <- `domain.events` com `#`

## Estratégia de retry + DLQ (por fila)

### Objetivo

Evitar que retry de um consumer republique o evento no exchange principal e gere duplicidade em outros consumers.

### Desenho adotado

Para cada fila `q.X`, são criados:

- exchange de retry: `retry.q.X` (`direct`)
- fila de retry: `q.X.retry` (TTL)
- exchange de DLQ: `dlq.q.X` (`direct`)
- fila de DLQ: `q.X.dlq`

### Fluxo de retry (TTL)

1. Consumer faz `nack`/reject com `requeue=false` em erro retryable.
2. A fila principal `q.X` dead-lettera para `retry.q.X` com routing key fixa `retry`.
3. A mensagem entra em `q.X.retry` (TTL padrao: `15000ms`).
4. Ao expirar TTL, `q.X.retry` dead-lettera para o default exchange (`""`) com routing key = `q.X`.
5. A mensagem volta somente para a fila original `q.X` (sem republish para `domain.events`/`domain.commands`).

### Fluxo de DLQ (estratégia implementada no MVP)

- Após `N` tentativas (MVP implementado: `3`), o consumer faz parking manual na DLQ da propria fila:
  - publicar em `dlq.q.X` com routing key `parking`
  - `ack` da mensagem atual
- Isso evita loop infinito de retry e preserva isolamento por consumer.

Observação:

- O contador pode ser derivado do header `x-death` do RabbitMQ (incrementado nas passagens pela `q.X.retry`).
- Implementacao atual: helper compartilhado em `packages/shared` aplica a politica com base no `x-death` da fila original (`q.X`).

## DLQ visível e re-drive (admin)

Foi adicionado um conjunto de endpoints administrativos no `api-gateway` (protegidos por role `admin`) para operacao das DLQs conhecidas do MVP:

- `GET /admin/dlq/queues`
- `GET /admin/dlq/queues/:queue/messages?limit=20` (peek)
- `POST /admin/dlq/queues/:queue/re-drive` (body: `{ "limit": 10 }`)

Filas aceitas no MVP:

- `q.upload.commands.dlq`
- `q.validator.dlq`
- `q.thumbnail.dlq`
- `q.extractor.dlq`
- `q.projection.dlq`
- `q.notification.dlq`
- `q.audit.dlq`

Estrategia de re-drive implementada (MVP):

- Leitura da DLQ via RabbitMQ Management API (`queue/get`)
- Republicacao para o exchange de retry da fila (`retry.q.X`) com routing key `retry`
- Adicao de headers de auditoria (`x-redriven-*`)

Observabilidade atual dos consumers:

- Falhas de processamento, retries e parking em DLQ emitem logs JSON (com `correlationId`, `queue`, `routingKey`, `messageType` e tentativas) nos workers.

Caveat do MVP:

- O re-drive via Management API usa `ack_requeue_false` ao ler da DLQ. Se a republicacao falhar apos a retirada da mensagem, pode ser necessario recovery manual (logs/audit). Para v0.2, evoluir para fluxo mais robusto (ex.: consumer admin dedicado + outbox/re-drive seguro).

## Como reaplicar a topologia após alterar definitions

O import ocorre quando o `rabbitmq-init` executa. Para recarregar:

```bash
docker compose -f infra/docker-compose.yml up -d --force-recreate rabbitmq rabbitmq-init
```

## Referências de infraestrutura

- `infra/docker-compose.yml`
- `infra/rabbitmq/definitions.json`
- `infra/rabbitmq/import-definitions.sh`
