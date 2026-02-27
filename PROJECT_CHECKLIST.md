# ✅ Checklist do Projeto — Event-Driven Upload Pipeline (v0.1)

> Marque itens concluídos trocando `[ ]` por `[x]`.
> Este arquivo foi pensado para ficar na **raiz do repositório**.

---

## 0) Preparação do repositório
- [x] Criar monorepo (apps/ + services/ + packages/ + infra/)
- [x] Padronizar Node.js (ex: `.nvmrc` / Volta) e package manager (pnpm/npm/yarn)
- [x] Configurar scripts raiz: `dev`, `lint`, `format`, `test`, `docker:up`, `docker:down`
- [x] Configurar ESLint/Prettier (root) e regras compartilhadas
- [x] Criar `.env.example` (root) com variáveis de infra e serviços
- [x] Adicionar `README.md` com instruções de setup local

---

## 1) Infra local (Docker Compose)
- [x] Criar `infra/docker-compose.yml` com:
  - [x] Postgres
  - [x] RabbitMQ (management)
  - [x] MinIO (S3 local + console)
  - [x] Keycloak
  - [x] Mailhog
- [x] Criar volumes nomeados (pg/minio) e rede interna
- [x] Criar init do MinIO (bucket(s) e policy) via container init ou script
- [x] Criar init do Keycloak (realm, client, roles: user/admin) via import JSON
- [x] Documentar portas e URLs locais (RabbitMQ, MinIO, Keycloak, Mailhog, Postgres)

---

## 2) Padrões base (Cross-cutting)
- [x] Definir envelope padrão de mensagens (event/command)
- [x] Criar `packages/shared` com:
  - [x] tipos de eventos/commands
  - [x] util de `correlationId` / `causationId`
  - [x] normalização de nomes (routing keys)
- [x] Definir naming padrão:
  - [x] exchanges: `domain.events`, `domain.commands`
  - [x] routing keys (ex: `files.uploaded.v1`)
  - [x] filas por serviço (ex: `q.validator`, `q.thumbnail`)
- [x] Definir estratégia de versionamento de eventos (`.v1`, `.v2`) e compatibilidade
- [x] Definir padrão de logs (JSON) incluindo `correlationId`

---

## 3) Postgres (modelo e ownership)
- [x] Definir estratégia: DB por serviço **ou** schema por serviço
- [x] Criar migrations iniciais do(s) serviço(s):
  - [x] upload-service: `files`, `outbox_events`
  - [x] projection-service: `uploads_read`, `upload_steps_read`, `upload_timeline_read`
  - [x] audit-service: `audit_events`
  - [x] notification-service: `notification_logs` (opcional)
- [x] Criar tabela de idempotência por consumer:
  - [x] `processed_events` (eventId, consumerName, processedAt)

---

## 4) RabbitMQ (topologia)
- [x] Criar exchanges:
  - [x] `domain.events` (topic)
  - [x] `domain.commands` (direct ou topic)
- [x] Criar filas e binds:
  - [x] `q.upload.commands` ← `commands.upload.*`
  - [x] `q.validator` ← `files.uploaded.*`
  - [x] `q.thumbnail` ← `files.validated.*`
  - [x] `q.extractor` ← `files.validated.*`
  - [x] `q.projection` ← `#`
  - [x] `q.notification` ← `processing.*`, `files.rejected.*`
  - [x] `q.audit` ← `#`
- [x] Configurar DLQ + retry (TTL ou estratégia definida) para cada fila

---

## 5) Serviços backend (NestJS)
- [x] Padronizar estrutura DDD tática nos serviços backend (`domain`, `application`, `infrastructure`, `presentation`)

### 5.1 api-gateway (HTTP/BFF)
- [x] Criar serviço `api-gateway`
- [x] Integrar Keycloak (JWT validation)
- [x] Endpoints v0:
  - [x] `POST /uploads` (iniciar upload)
  - [x] `POST /uploads/:fileId/confirm` (confirmar upload no MinIO e publicar command)
  - [x] `GET /uploads/:fileId/status`
  - [x] `GET /uploads` (minha lista / admin lista)
  - [x] `POST /admin/uploads/:fileId/reprocess` (admin)
- [x] Publicar commands no RabbitMQ (UploadRequested, ReprocessRequested)

### 5.2 upload-service
- [x] Criar serviço `upload-service`
- [x] Implementar command handler `UploadRequested`
- [x] Upload flow (escolher 1):
  - [ ] Multipart via gateway → upload-service → MinIO
  - [x] Presigned URL MinIO (recomendado) + confirmação
- [x] Persistir `files` + `outbox_events` (mesma transação)
- [x] Publicar `FileUploaded.v1` via Outbox Publisher

### 5.3 validator-service
- [x] Criar serviço `validator-service`
- [x] Consumir `FileUploaded.v1`
- [x] Implementar validação (mime/tamanho/assinatura)
- [x] Publicar `FileValidated.v1` ou `FileRejected.v1`
- [x] Implementar idempotência (processed_events)

### 5.4 thumbnail-service
- [x] Criar serviço `thumbnail-service`
- [x] Consumir `FileValidated.v1`
- [x] Gerar thumbnail (sharp) e salvar no MinIO
- [x] Publicar `ThumbnailGenerated.v1`
- [x] Implementar idempotência (processed_events)

### 5.5 extractor-service
- [x] Criar serviço `extractor-service`
- [x] Consumir `FileValidated.v1`
- [x] Extrair metadata (dimensões, checksum, etc.)
- [x] Publicar `MetadataExtracted.v1`
- [x] Implementar idempotência (processed_events)

### 5.6 projection-service (read model)
- [x] Criar serviço `projection-service`
- [x] Consumir eventos:
  - [x] `FileUploaded.v1`
  - [x] `FileValidated.v1`
  - [x] `FileRejected.v1`
  - [x] `ThumbnailGenerated.v1`
  - [x] `MetadataExtracted.v1`
  - [x] `ProcessingCompleted.v1` (quando existir)
- [x] Atualizar tabelas read:
  - [x] status por etapa
  - [x] timeline por upload
- [ ] Expor API interna (opcional) ou acesso direto pelo gateway via DB
- [x] Implementar idempotência (processed_events)

### 5.7 notification-service (Mailhog)
- [x] Criar serviço `notification-service`
- [x] Consumir `ProcessingCompleted.v1` e `FileRejected.v1`
- [x] Enviar e-mail via SMTP (Mailhog)
- [x] Persistir log de notificação
- [x] Implementar idempotência (processed_events)

### 5.8 audit-service
- [x] Criar serviço `audit-service`
- [x] Consumir todos eventos (`#`)
- [x] Persistir audit log imutável (tipo, occurredAt, correlationId, payload resumido)
- [x] Implementar idempotência (processed_events)

### 5.9 Padronização de configuração e Docker (pré-item 6)
- [x] Config por serviço (NestJS) com `@nestjs/config` + validação (template em `upload-service` e `validator-service`)
- [x] Replicar padrão de config/validação para todos backends
- [x] Criar `.env.example` por serviço/backend
- [x] Limpar scripts `start/dev` (sem `source` manual)
- [x] Adicionar `Dockerfile` multi-stage (`dev`/`build`/`prod`) para cada backend
- [x] Criar compose full dev (`infra` + `backends`) com hot reload
- [x] Ajustar scripts raiz (`docker:up`, `docker:down`, `docker:up:infra`, logs)
- [x] Atualizar `README.md` com modo local (host) e modo Docker full stack

---

## 6) Eventos e contratos (v1)
- [x] Definir (type + routing key + payload) para:
  - [x] `UploadRequested.v1` (command)
  - [x] `FileUploaded.v1`
  - [x] `FileValidated.v1`
  - [x] `FileRejected.v1`
  - [x] `ThumbnailGenerated.v1`
  - [x] `MetadataExtracted.v1`
  - [x] `ProcessingCompleted.v1`
  - [x] `ReprocessFileRequested.v1` (command)
- [x] Documentar exemplos JSON para cada evento/command
- [x] Definir regras de compatibilidade e evolução (.v2)

---

## 7) Robustez e qualidade
- [x] Outbox Pattern completo (publisher + retry)
  - `upload-service`, `projection-service`, `validator-service`, `thumbnail-service` e `extractor-service` publicam via outbox com retry operacional (tentativas maximas + falha terminal em `publish_status='failed'` + telemetria)
- [x] DLQ visível e processo de “re-drive” (admin)
  - Endpoints admin no `api-gateway`: listagem, peek e re-drive de filas `q.*.dlq` conhecidas
  - Re-drive em modo seguro (AMQP confirm + `ack` somente após publish) com rastreio por `operationCorrelationId`
- [x] Regras de retry (ex: 3 tentativas + DLQ)
  - Consumers dos workers aplicam politica com `x-death`: ate 3 tentativas e parking manual em `dlq.q.X` (routing key `parking`)
- [x] Timeouts e limites (tamanho máximo, tipos suportados)
  - `api-gateway` valida `sizeBytes`/MIME permitido por config e aplica timeout em JWKS + RabbitMQ Management API
  - Workers ja possuem limites/tipos suportados configuraveis (validator/thumbnail/extractor)
- [x] Padronizar erros (códigos e mensagens) no gateway
  - `api-gateway` usa filtro HTTP global com envelope de erro padronizado (`code`, `message`, `statusCode`, `correlationId`, `path`, `method`)
- [x] Logs estruturados com `correlationId` em todos serviços
  - Cobertura em todos os servicos: bootstraps, consumers/publishers AMQP, use cases principais, outbox pollers, repositórios/infra e componentes operacionais do `api-gateway` (DLQ admin, command publisher, filtro HTTP)
- [ ] Planejar introdução de Saga (v0.2) sem quebrar o MVP atual
  - [ ] Definir Saga coreografada com Process Manager explícito (documentação + ADR)
  - [ ] Modelar estados da saga e regras de transição (`completed` / `failed` / `timed-out`)
  - [ ] Definir timeouts de processo e política de expiração
  - [ ] Definir eventos de término planejados (`ProcessingFailed.v1`, `ProcessingTimedOut.v1`)
  - [ ] Planejar migração da regra de conclusão de `ProcessingCompleted.v1` do `projection-service` para a Saga
  - [ ] Definir testes da Saga (happy path, falha, timeout) para v0.2

---

## 8) Frontend — user-web (Vite)
- [ ] Criar app `user-web`
- [ ] Login (Keycloak)
- [ ] Tela de upload
- [ ] Tela de “meus uploads”
- [ ] Tela de detalhe: status por etapa + timeline
- [ ] Polling (MVP) ou SSE/WebSocket (v0.2)

---

## 9) Frontend — admin-web (Vite)
- [ ] Criar app `admin-web`
- [ ] Login (Keycloak) + role admin
- [ ] Listagem global de uploads + filtros básicos
- [ ] Detalhe: status + timeline + erros
- [ ] Ação: reprocessar (command)
- [ ] Ação: re-drive DLQ (v0.2)

---

## 10) Testes
- [ ] Unit tests (mínimo) para handlers de eventos/commands
- [ ] Contract tests para mensagens (schema/validation)
- [ ] Teste de fluxo E2E local:
  - [ ] upload → validated → thumbnail+metadata → completed
  - [ ] cenário de erro → rejected → email → audit

---

## 11) Documentação
- [ ] `README.md` com:
  - [ ] como subir infra
  - [ ] como rodar serviços e front
  - [ ] URLs locais (RabbitMQ, Keycloak, MinIO, Mailhog)
  - [ ] passo a passo de teste manual do fluxo
- [ ] `docs/architecture.md` com diagramas (flow + sequence)
- [ ] `docs/events.md` com catálogo de eventos e payloads

---

## 12) “Definition of Done” (DoD) do MVP

- [ ] Usuário faz upload e vê status por etapa até concluir
- [ ] Admin vê visão global e consegue reprocessar
- [ ] Eventos trafegam via RabbitMQ com DLQ configurado
- [ ] Outbox e idempotência implementados
- [ ] Notificação (Mailhog) enviada em sucesso/falha
- [ ] Audit log registrando todo o fluxo

## 13) Arquitetura Frontend (regra obrigatória)
- [ ] Definir estado global com Zustand para cada app (`user-web` e `admin-web`)
- [ ] Proibir lógica de negócio em componentes de apresentação
- [ ] Centralizar regras de negócio, effects e integração com APIs em hooks customizados
- [ ] Criar organização base de frontend:
  - [ ] `stores/` (estado global)
  - [ ] `hooks/` (casos de uso e regras)
  - [ ] `components/ui/` (apresentação pura)
  - [ ] `components/feature/` (composição sem regra de negócio)
- [ ] Garantir que componentes de apresentação recebam apenas `props` e callbacks
- [ ] Definir guideline de revisão: PR é bloqueado se houver regra de negócio em componente visual
