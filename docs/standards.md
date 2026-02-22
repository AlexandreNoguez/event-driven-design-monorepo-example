# Cross-Cutting Standards (Item 2)

Este documento consolida as decisoes base de mensageria, naming, versionamento e logs para o MVP.

## 1. Envelope padrao (event/command)

Usar um envelope unico para commands e events, diferenciando por `kind`.

Campos obrigatorios:

- `messageId` (UUID)
- `kind` (`event` | `command`)
- `type` (ex.: `FileUploaded.v1`)
- `occurredAt` (ISO-8601)
- `correlationId`
- `producer` (nome do servico)
- `version` (numero do schema/envelope)
- `payload`

Campos opcionais:

- `causationId` (mensagem que originou a atual)

Observacao:

- Para tabelas de idempotencia focadas em eventos (`processed_events.eventId`), persistir o valor de `messageId` do envelope de evento.

Implementacao:

- `packages/shared/src/messaging/envelope.ts`
- `packages/shared/src/messaging/ids.ts`

## 2. Naming padrao (RabbitMQ)

### Exchanges

- Events: `domain.events`
- Commands: `domain.commands`

### Routing keys

Formato:

- Events: `<dominio>.<acao>.vN`
- Commands: `commands.<alvo>.<acao>.vN`

Exemplos:

- `files.uploaded.v1`
- `files.validated.v1`
- `commands.upload.requested.v1`
- `commands.file.reprocess.v1`

Helpers e normalizacao:

- `normalizeRoutingKeySegment(...)`
- `buildRoutingKey(...)`
- `eventRoutingKey(...)`
- `commandRoutingKey(...)`

Implementacao:

- `packages/shared/src/messaging/naming.ts`
- `packages/shared/src/standards.ts`

### Filas por servico (baseline MVP)

- `q.upload.commands`
- `q.validator`
- `q.thumbnail`
- `q.extractor`
- `q.projection`
- `q.notification`
- `q.audit`

Bindings default documentados em:

- `packages/shared/src/standards.ts`

## 3. Versionamento de eventos (.v1, .v2)

Regras:

- Toda mensagem versionada no `type` e na routing key com sufixo `.vN`.
- Mudancas aditivas e backward-compatible podem permanecer na mesma versao.
- Mudancas breaking (renomear/remover campo, alterar semantica, trocar tipo incompatível) exigem nova versao (`.v2`).
- Durante migracao, produtores podem publicar versoes em paralelo e consumidores devem ser migrados gradualmente.
- Consumidores devem ignorar campos desconhecidos quando possivel.

Referencia em codigo:

- `EVENT_VERSIONING_STRATEGY` em `packages/shared/src/standards.ts`

## 4. Padrao de logs (JSON) com correlationId

Todos os servicos devem emitir logs em JSON.

Campos obrigatorios:

- `timestamp`
- `level`
- `service`
- `message`
- `correlationId`

Campos recomendados (quando houver contexto):

- `causationId`
- `messageId`
- `messageType`
- `routingKey`
- `queue`
- `fileId`
- `userId`
- `error`

Implementacao base:

- `packages/shared/src/logging/json-log.ts`

Exemplo:

```json
{
  "timestamp": "2026-02-22T12:00:00.000Z",
  "level": "info",
  "service": "validator-service",
  "message": "File validated",
  "correlationId": "c0e6f7e4-fc91-4e19-a801-3c8e214e6c7b",
  "messageId": "bcbf69de-3f9d-4f0f-bec0-1862f3438b6e",
  "messageType": "FileValidated.v1",
  "routingKey": "files.validated.v1",
  "fileId": "file_123"
}
```
