# GitHub Backlog Inicial — Event-Driven Upload Pipeline

Este backlog foi organizado para execução em milestones curtas, com foco em portfólio demonstrável.

## Labels sugeridas
- `infra`
- `architecture`
- `backend`
- `frontend`
- `service:api-gateway`
- `service:upload`
- `service:validator`
- `service:thumbnail`
- `service:extractor`
- `service:projection`
- `service:notification`
- `service:audit`
- `event-contract`
- `observability`
- `testing`
- `documentation`

## Milestone M0 — Base do Monorepo

### Issue 1: Inicializar estrutura do monorepo
- Labels: `architecture`
- Descrição: Criar estrutura base `apps/`, `services/`, `packages/`, `infra/`.
- Critérios de aceite:
  - Estrutura de pastas criada conforme arquitetura definida
  - `README.md` atualizado com visão geral do monorepo

### Issue 2: Padronizar ambiente Node e package manager
- Labels: `architecture`
- Descrição: Definir versão de Node (`.nvmrc` ou Volta) e package manager oficial.
- Critérios de aceite:
  - Arquivo de versão do Node no root
  - Lockfile e instrução única de instalação no README

### Issue 3: Scripts raiz e qualidade de código
- Labels: `architecture`
- Descrição: Criar scripts `dev`, `lint`, `format`, `test`, `docker:up`, `docker:down`.
- Critérios de aceite:
  - Scripts executáveis a partir da raiz
  - ESLint e Prettier configurados e funcionando

### Issue 4: Variáveis de ambiente base
- Labels: `architecture`
- Descrição: Criar `.env.example` com todas as variáveis previstas para infra e serviços.
- Critérios de aceite:
  - `.env.example` completo no root
  - README com instrução de uso

## Milestone M1 — Infra local e contratos v1

Status atual:
- `5` concluída (infra local via Docker Compose)
- `6` concluída (bootstrap MinIO + Keycloak)
- `7` concluída (`docs/events.md` + exemplos JSON + regras `.v2`)
- `8` concluída (`packages/shared` com contratos/envelope/naming)

### Issue 5: Subir infraestrutura local via Docker Compose
- Labels: `infra`
- Descrição: Configurar `infra/docker-compose.yml` com Postgres, RabbitMQ, MinIO, Keycloak e Mailhog.
- Critérios de aceite:
  - Todos os containers sobem sem erro
  - Portas e URLs documentadas no README

### Issue 6: Inicialização do MinIO e Keycloak
- Labels: `infra`
- Descrição: Adicionar bootstrap de bucket/policy do MinIO e realm/client/roles do Keycloak.
- Critérios de aceite:
  - Bucket de uploads disponível ao subir o compose
  - Realm com roles `user` e `admin` disponível

### Issue 7: Definir contrato de mensagens v1
- Labels: `event-contract`, `architecture`
- Descrição: Formalizar envelope padrão e catálogo de commands/events v1.
- Critérios de aceite:
  - `docs/events.md` com type, routing key e payload mínimo
  - Estratégia de versionamento `.v1/.v2` documentada

### Issue 8: Criar pacote compartilhado de contratos
- Labels: `event-contract`
- Descrição: Criar `packages/shared` com tipos, utilitários de `correlationId/causationId` e naming.
- Critérios de aceite:
  - Tipos compartilhados consumíveis por backend e frontend
  - Convenção de nomes de exchange/routing key centralizada

## Milestone M1.5 — Padronização de Configuração e Docker (pré-item 6)

Status atual:
- `8.1` concluída (config validada por serviço com `@nestjs/config`)
- `8.2` concluída para backends (`.env.example` por serviço); frontends ficam para itens `8/9`
- `8.3` concluída (Dockerfiles multi-stage para backends)
- `8.4` concluída (compose full dev + scripts raiz para stack completa)

### Issue 8.1: Padronizar config por serviço com validação (NestJS)
- Labels: `architecture`, `backend`
- Descrição: Adotar `@nestjs/config` com validação fail-fast e env files por serviço (`.env`, `.env.local`) para todos os backends.
- Critérios de aceite:
  - `upload-service` e `validator-service` servem como template inicial
  - Todos os backends carregam `.env` local sem `source` manual
  - Erros de configuração são explícitos no bootstrap

### Issue 8.2: Criar `.env.example` por serviço/app
- Labels: `architecture`, `documentation`
- Descrição: Criar exemplos de variáveis por serviço/backend (e depois por frontend), reduzindo dependência do `.env` raiz.
- Critérios de aceite:
  - Cada backend possui `services/<name>/.env.example`
  - `README` documenta fluxo de cópia e override

### Issue 8.3: Adicionar Dockerfiles multi-stage para backends
- Labels: `infra`, `backend`
- Descrição: Criar `Dockerfile` único por backend com stages `dev`, `build` e `prod`.
- Critérios de aceite:
  - Hot reload em dev via `target: dev`
  - Imagem de produção enxuta via `target: prod`

### Issue 8.4: Compose full dev (infra + backends) com hot reload
- Labels: `infra`, `architecture`
- Descrição: Criar compose de desenvolvimento completo para subir infraestrutura e backends com um único comando.
- Critérios de aceite:
  - `pnpm docker:up` sobe stack local completa (infra + serviços backend)
  - `pnpm docker:up:infra` mantém opção de subir só infra
  - Healthchecks e dependências mínimas configuradas
  - Compose validado com `docker compose ... config`

## Milestone M2 — Fluxo mínimo fim-a-fim (demo inicial)

### Issue 9: Implementar `service:api-gateway` v0
- Labels: `backend`, `service:api-gateway`
- Descrição: Criar gateway com autenticação JWT (Keycloak) e endpoints iniciais de upload/status.
- Critérios de aceite:
  - `POST /uploads`
  - `GET /uploads/:fileId/status`
  - `GET /uploads`

### Issue 10: Implementar `service:upload` com outbox inicial
- Labels: `backend`, `service:upload`
- Descrição: Receber command `UploadRequested`, persistir `files + outbox_events`, publicar `FileUploaded.v1`.
- Critérios de aceite:
  - Persistência em transação única
  - Publicação do evento via outbox publisher

### Issue 11: Implementar `service:validator`
- Labels: `backend`, `service:validator`
- Descrição: Consumir `FileUploaded.v1`, validar arquivo e publicar `FileValidated.v1` ou `FileRejected.v1`.
- Critérios de aceite:
  - Validação de mime e tamanho funcionando
  - Idempotência com `processed_events`

### Issue 12: Implementar `service:projection` (read model mínimo)
- Labels: `backend`, `service:projection`
- Descrição: Consumir eventos do fluxo mínimo e manter status/timeline para consulta.
- Critérios de aceite:
  - Tabelas `uploads_read`, `upload_steps_read`, `upload_timeline_read`
  - Status consultável pelo gateway

### Issue 13: Criar `app:user-web` v0 com arquitetura frontend obrigatória
- Labels: `frontend`
- Descrição: Implementar telas mínimas de upload + listagem/status seguindo padrão: estado global em Zustand, lógica somente em hooks, componentes apenas apresentação.
- Critérios de aceite:
  - Store global com Zustand para estado de upload/status
  - Hooks centralizando regras e efeitos (`useUploadFlow`, `useUploadsList`)
  - Componentes visuais sem chamadas diretas de API e sem regra de negócio

## Milestone M3 — Pipeline completo

### Issue 14: Implementar `service:thumbnail`
- Labels: `backend`, `service:thumbnail`
- Descrição: Consumir `FileValidated.v1`, gerar thumbnail no MinIO e publicar `ThumbnailGenerated.v1`.
- Critérios de aceite:
  - Thumbnail persistida em `thumbnails/`
  - Idempotência implementada

### Issue 15: Implementar `service:extractor`
- Labels: `backend`, `service:extractor`
- Descrição: Consumir `FileValidated.v1`, extrair metadata e publicar `MetadataExtracted.v1`.
- Critérios de aceite:
  - Campos mínimos de metadata definidos e persistidos
  - Idempotência implementada

### Issue 16: Fechar evento de conclusão de processamento
- Labels: `event-contract`, `service:projection`
- Descrição: Definir gatilho para `ProcessingCompleted.v1` quando etapas necessárias terminarem.
- Critérios de aceite:
  - Regra de conclusão documentada
  - Evento refletido na timeline/read model

## Milestone M4 — Robustez e operação

### Issue 17: Outbox completo com retry
- Labels: `backend`, `observability`
- Descrição: Completar ciclo outbox (publisher, retry, marcação de entrega).
- Critérios de aceite:
  - Mensagens não se perdem em reinício de serviço
  - Telemetria mínima de falhas no publisher

### Issue 18: DLQ e estratégia de re-drive
- Labels: `infra`, `observability`
- Descrição: Configurar DLQ/retry por fila e documentar operação de re-drive.
- Critérios de aceite:
  - Filas DLQ criadas para consumers críticos
  - Processo de re-drive descrito no README

### Issue 19: Criar `app:admin-web` v0
- Labels: `frontend`
- Descrição: Listagem global, detalhe e ação de reprocessar; seguir padrão frontend obrigatório.
- Critérios de aceite:
  - Zustand como estado global
  - Hooks para toda lógica de listagem/detalhe/reprocessamento
  - Componentes de apresentação puros

### Issue 20: Implementar `service:notification`
- Labels: `backend`, `service:notification`
- Descrição: Consumir sucesso/falha e enviar e-mail via Mailhog com log de envio.
- Critérios de aceite:
  - E-mails visíveis no Mailhog
  - Idempotência com `processed_events`

### Issue 21: Implementar `service:audit`
- Labels: `backend`, `service:audit`
- Descrição: Consumir eventos e persistir trilha imutável de auditoria.
- Critérios de aceite:
  - Registro com tipo, occurredAt, correlationId e resumo do payload
  - Consulta de auditoria disponível para depuração

## Milestone M5 — Testes e documentação de portfólio

### Issue 22: Testes unitários e de contrato
- Labels: `testing`
- Descrição: Cobrir handlers de command/event e contratos de mensagens.
- Critérios de aceite:
  - Suite mínima de unit tests por serviço crítico
  - Validação de schema para eventos v1

### Issue 23: Teste E2E local do pipeline
- Labels: `testing`
- Descrição: Executar cenários de sucesso e falha ponta a ponta.
- Critérios de aceite:
  - Cenário sucesso: upload -> completed
  - Cenário falha: upload inválido -> rejected -> notificação

### Issue 24: Pacote final de documentação de portfólio
- Labels: `documentation`
- Descrição: Consolidar `README`, `docs/architecture.md`, `docs/events.md` e roteiro de demonstração.
- Critérios de aceite:
  - Passo a passo de execução local completo
  - Diagramas atualizados
  - Narrativa clara de Event-Driven Design para recrutador

## Definition of Done por milestone
- M0: Estrutura e qualidade prontas para acelerar execução.
- M1: Infra local confiável + contratos v1 fechados.
- M2: Primeiro fluxo visível em UI (`user-web`) com status de processamento.
- M3: Pipeline assíncrono completo (validação + thumbnail + metadata + conclusão).
- M4: Confiabilidade operacional (outbox, DLQ, admin, audit, notificação).
- M5: Evidência técnica forte para portfólio (testes + docs + demo).
