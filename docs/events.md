# Catalogo de Eventos e Commands (v1)

Este documento consolida o catalogo canônico de mensagens v1 do pipeline (commands + events), com `type`, `exchange`, `routing key`, payload mínimo, exemplos JSON e regras de evolução para futuras versões (`.v2`).

Referências em código:

- `packages/shared/src/messaging/contracts.ts`
- `packages/shared/src/standards.ts`
- `docs/standards.md`

## 1. Catálogo v1 (resumo)

| Kind | Type | Exchange | Routing key | Producer | Consumers | Status |
| --- | --- | --- | --- | --- | --- | --- |
| command | `UploadRequested.v1` | `domain.commands` | `commands.upload.requested.v1` | `api-gateway` | `upload-service` | implemented |
| command | `ReprocessFileRequested.v1` | `domain.commands` | `commands.file.reprocess.v1` | `api-gateway` | `upload-service` (handler pendente) | planned |
| event | `FileUploaded.v1` | `domain.events` | `files.uploaded.v1` | `upload-service` | `validator-service`, `projection-service`, `audit-service` | implemented |
| event | `FileValidated.v1` | `domain.events` | `files.validated.v1` | `validator-service` | `thumbnail-service`, `extractor-service`, `projection-service`, `audit-service` | implemented |
| event | `FileRejected.v1` | `domain.events` | `files.rejected.v1` | `validator-service` | `projection-service`, `notification-service`, `audit-service` | implemented |
| event | `ThumbnailGenerated.v1` | `domain.events` | `thumbnails.generated.v1` | `thumbnail-service` | `projection-service`, `audit-service` | implemented |
| event | `MetadataExtracted.v1` | `domain.events` | `metadata.extracted.v1` | `extractor-service` | `projection-service`, `audit-service` | implemented |
| event | `ProcessingCompleted.v1` | `domain.events` | `processing.completed.v1` | `processing-completor` (planned) | `projection-service`, `notification-service`, `audit-service` | planned |

## 2. Contratos v1 (payload mínimo)

Todos os examples abaixo usam o envelope padrão (`messageId`, `kind`, `type`, `occurredAt`, `correlationId`, `producer`, `version`, `payload`) definido em `packages/shared/src/messaging/envelope.ts`.

### 2.1 `UploadRequested.v1` (command)

Payload mínimo:

- `fileId: string`
- `fileName: string`
- `contentType: string`
- `sizeBytes: number`
- `userId?: string`
- `tenantId?: string`

### 2.2 `ReprocessFileRequested.v1` (command)

Payload mínimo:

- `fileId: string`
- `reason?: string`
- `userId?: string`
- `tenantId?: string`

### 2.3 `FileUploaded.v1`

Payload mínimo:

- `fileId: string`
- `fileName: string`
- `contentType: string`
- `sizeBytes: number`
- `bucket: string`
- `objectKey: string`
- `userId?: string`
- `tenantId?: string`

### 2.4 `FileValidated.v1`

Payload mínimo:

- `fileId: string`
- `bucket: string`
- `objectKey: string`
- `contentType: string`
- `sizeBytes: number`
- `checksum?: string` (atual: `md5:<etag>` quando disponível)
- `userId?: string`
- `tenantId?: string`

### 2.5 `FileRejected.v1`

Payload mínimo:

- `fileId: string`
- `bucket: string`
- `objectKey: string`
- `code: string`
- `reason: string`
- `userId?: string`
- `tenantId?: string`

### 2.6 `ThumbnailGenerated.v1`

Payload mínimo:

- `fileId: string`
- `thumbnailBucket: string`
- `thumbnailObjectKey: string`
- `width?: number`
- `height?: number`
- `userId?: string`
- `tenantId?: string`

### 2.7 `MetadataExtracted.v1`

Payload mínimo:

- `fileId: string`
- `metadata: object`
- `userId?: string`
- `tenantId?: string`

Observação:

- O conteúdo interno de `metadata` é flexível (mapa) e deve evoluir de forma aditiva.

### 2.8 `ProcessingCompleted.v1`

Payload mínimo (planejado):

- `fileId: string`
- `status: "completed" | "failed"`
- `completedSteps: string[]`
- `userId?: string`
- `tenantId?: string`

## 3. Exemplos JSON (envelope completo)

Arquivos:

- `docs/events/examples/upload-requested.v1.command.json`
- `docs/events/examples/reprocess-file-requested.v1.command.json`
- `docs/events/examples/file-uploaded.v1.event.json`
- `docs/events/examples/file-validated.v1.event.json`
- `docs/events/examples/file-rejected.v1.event.json`
- `docs/events/examples/thumbnail-generated.v1.event.json`
- `docs/events/examples/metadata-extracted.v1.event.json`
- `docs/events/examples/processing-completed.v1.event.json`

## 4. Regras de compatibilidade e evolução (`.v2`)

### 4.1 Pode permanecer em `v1`

Mudanças aditivas e backward-compatible, por exemplo:

- adicionar campo opcional no `payload`
- adicionar nova chave dentro de `metadata` em `MetadataExtracted.v1`
- enriquecer logs/documentação sem alterar semântica de campos existentes

### 4.2 Exige nova versão (`v2`)

Mudanças breaking, por exemplo:

- renomear/remover campo existente
- trocar tipo incompatível (`sizeBytes: number` -> `string`)
- alterar semântica de campo mantendo o mesmo nome
- alterar contrato obrigatório de forma incompatível

### 4.3 Estratégia de rollout recomendada

1. Publicar `v1` e `v2` em paralelo (com routing keys distintas).
2. Migrar consumidores gradualmente.
3. Monitorar leitura/uso de `v1`.
4. Descontinuar `v1` somente após confirmação de migração.

### 4.4 Regras para consumidores

- Ignorar campos desconhecidos quando possível.
- Validar somente os campos mínimos necessários para a regra de negócio.
- Registrar `type`, `messageId`, `correlationId` e `routingKey` ao rejeitar mensagens.

## 5. Status do fluxo fim-a-fim (MVP atual)

- O fluxo implementado atualmente publica até `ThumbnailGenerated.v1` e `MetadataExtracted.v1`.
- `ProcessingCompleted.v1` já está catalogado, mas o publisher ainda é planejado.
- Por isso, o primeiro smoke-test "completo" (com conclusão do processamento) deve ser executado após a implementação desse publisher.
