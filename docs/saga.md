# Saga (Planejada para v0.2)

## Objetivo

Documentar a evolução planejada do pipeline para uma **Saga explícita** sem alterar o comportamento atual do MVP.

Estado atual:

- O projeto já é **Event-Driven Design (EDD)**.
- A coordenação de conclusão do pipeline está **implícita** no `projection-service`.
- `ProcessingCompleted.v1` já é publicado (via outbox no `projection-service`).

Estado alvo (v0.2):

- Introduzir uma **Saga coreografada com Process Manager explícito** para coordenar o ciclo de processamento de cada arquivo.

## Decisão arquitetural (roadmap)

### Escolha

- **Saga coreografada** (eventos continuam sendo o mecanismo principal de integração)
- **Process Manager explícito** (serviço/módulo dedicado para estado e transições da saga)

### Por que essa escolha

- Mantém o estilo **event-driven** já adotado
- Evita migrar para orquestração central rígida cedo demais
- Deixa regras de conclusão/falha/timeout explícitas e testáveis
- Melhora a narrativa de arquitetura para portfólio (evolução incremental consciente)

## O que muda conceitualmente

Hoje (MVP):

- `projection-service` projeta eventos no read model
- e também detecta conclusão para publicar `ProcessingCompleted.v1`

Futuro (v0.2):

- Um **Process Manager** acompanha o progresso por `fileId`/`correlationId`
- Publica eventos de término (`completed`, `failed`, `timed out`)
- `projection-service` continua focado em **read model** (consulta e timeline)

## Escopo inicial da Saga (v0.2)

### Entradas observadas pelo Process Manager

- `FileUploaded.v1`
- `FileValidated.v1`
- `FileRejected.v1`
- `ThumbnailGenerated.v1`
- `MetadataExtracted.v1`
- (futuro) eventos de erro/timeout das etapas

### Saídas da Saga (planejadas)

- `ProcessingCompleted.v1` (migrar producer do `projection-service` para o Process Manager)
- `ProcessingFailed.v1` (novo)
- `ProcessingTimedOut.v1` (novo)

## Estados sugeridos da saga

- `started`
- `awaiting-validation`
- `awaiting-processing-branches`
- `partially-completed`
- `completed`
- `failed`
- `timed-out`

Observação:

- O modelo exato pode ser simplificado no MVP v0.2, desde que as transições e estados terminais fiquem explícitos.

## Regras de transição (proposta inicial)

- `FileUploaded.v1` -> inicia saga (`awaiting-validation`)
- `FileValidated.v1` -> aguarda `thumbnail` + `metadata`
- `FileRejected.v1` -> termina em `failed`
- `ThumbnailGenerated.v1` + `MetadataExtracted.v1` + validação ok -> termina em `completed`
- Timeout configurado sem conclusão -> termina em `timed-out`

## Timeouts, retry e compensação (planejado)

- **Retry** continua sendo responsabilidade primária dos consumers/fila (RabbitMQ retry + DLQ).
- **Saga** lida com:
  - timeout de processo
  - decisão de estado terminal (`failed`/`timed-out`)
  - eventual disparo de compensações leves (quando fizer sentido)

Compensações (v0.2, mínimas):

- Prioridade em compensação **lógica** (estado final + notificação + audit)
- Compensação física (ex.: cleanup de thumbnail/objeto) pode entrar depois, com política explícita

## Persistência sugerida da saga

Schema/tabelas (proposta):

- `processing_manager.processing_sagas`
- `processing_manager.processing_saga_events` (opcional, para rastreabilidade)
- `processing_manager.outbox_events` (se o Process Manager publicar via outbox)

Campos mínimos da saga:

- `saga_id`
- `file_id`
- `correlation_id`
- `status`
- `started_at`
- `updated_at`
- `completed_at` (nullable)
- `deadline_at` (timeout)

## Observabilidade (obrigatório na adoção)

- Logs JSON com:
  - `correlationId`
  - `fileId`
  - `sagaId`
  - `eventType`
  - `fromState`
  - `toState`
- Métricas mínimas:
  - sagas ativas
  - sagas concluídas
  - sagas falhas
  - sagas expiradas (timeout)
  - tempo médio de conclusão

## Estratégia de migração incremental (recomendada)

1. **Design + ADR + checklist** (este passo)
2. Implementar Process Manager em modo "shadow" (observa e projeta estado, sem publicar término)
3. Validar consistência entre conclusão atual (`projection-service`) e conclusão calculada pela saga
4. Mover publicação de `ProcessingCompleted.v1` para o Process Manager (com outbox)
5. Adicionar `ProcessingFailed.v1` / `ProcessingTimedOut.v1`
6. Atualizar `projection-service` para consumir eventos da saga, mantendo foco em read model

## O que não muda

- O projeto continua sendo **Event-Driven Design**
- RabbitMQ continua como backbone de integração assíncrona
- Outbox, idempotência, retry e DLQ continuam válidos e necessários

## Referências no repositório

- `docs/events.md` (catálogo de messages v1)
- `docs/standards.md` (envelope, versionamento, naming e logs)
- `docs/adr/0001-saga-adoption.md` (decisão arquitetural)
