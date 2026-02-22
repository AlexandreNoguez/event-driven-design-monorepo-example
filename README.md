# Documento Inicial — Event-Driven Upload Pipeline (v0.1)

## 0) Setup local inicial (M0)

Este repositório foi preparado como **monorepo** com `pnpm`, com estrutura base para evoluir os apps e serviços.

### Estrutura base

```text
apps/
services/
packages/
infra/
```

### Pré-requisitos

- Node.js `22` (ver `.nvmrc`)
- `pnpm` `>= 10`
- Docker + Docker Compose (para a infraestrutura local)

### Instalação

```bash
pnpm install
cp .env.example .env
```

### Scripts raiz

```bash
pnpm dev
pnpm lint
pnpm format
pnpm test
pnpm docker:up
pnpm docker:down
```

> `docker:up` / `docker:down` dependem de `infra/docker-compose.yml`, que será criado na etapa de infraestrutura local.

### Infra local (Docker Compose)

Arquivos do ambiente local:

- `infra/docker-compose.yml`
- `infra/minio/init-minio.sh` (cria buckets e aplica policies)
- `infra/keycloak/import/realm-event-pipeline.json` (realm + clients + roles)

Subir infraestrutura:

```bash
cp .env.example .env
pnpm docker:up
```

Derrubar infraestrutura:

```bash
pnpm docker:down
```

### Portas e URLs locais

- Postgres: `localhost:5432`
- RabbitMQ (AMQP): `localhost:5672`
- RabbitMQ Management: `http://localhost:15672`
- MinIO API (S3): `http://localhost:9000`
- MinIO Console: `http://localhost:9001`
- Keycloak: `http://localhost:8080`
- Mailhog (SMTP): `localhost:1025`
- Mailhog UI: `http://localhost:8025`

### Bootstrap local (MinIO + Keycloak)

- MinIO:
  - buckets: `uploads` (privado) e `thumbnails` (download anonimo para demo local)
- Keycloak:
  - realm: `event-pipeline`
  - roles: `user`, `admin`
  - clients: `user-web`, `admin-web`, `api-gateway`
  - usuarios demo:
    - `demo-user` / `demo123` (role `user`)
    - `demo-admin` / `demo123` (roles `user`, `admin`)

## 1) Visão geral

Construiremos uma plataforma **100% local e gratuita**, composta por:

- **2 frontends**: `user-web` e `admin-web` (apps separados)
- **microserviços NestJS** com responsabilidade única
- comunicação predominante **assíncrona via RabbitMQ**
- persistência em **PostgreSQL**
- armazenamento de arquivos em **MinIO (S3 local)**
- autenticação via **Keycloak**
- simulação de e-mails via **Mailhog**
- projeções de leitura (read model) para UI (**CQRS leve**)

A proposta central: um **pipeline de upload** em etapas (validar → gerar thumbnail → extrair metadata → finalizar) com rastreabilidade e atualização de status.

---

## 2) Objetivos do MVP

1. Permitir upload de arquivos (imagem inicialmente) e registrar o processamento por etapas.
2. Processar de forma assíncrona e escalável (mesmo local).
3. Exibir status em tempo real (ou “quase real”) para usuário e admin.
4. Garantir robustez mínima: **Outbox**, **Idempotência**, **Retry + DLQ**, **correlationId**.

---

## 3) Stack (local / gratuita)

**Infra (Docker Compose)**

- RabbitMQ (com management UI)
- Postgres (1 instância)
- MinIO (S3 local + console)
- Keycloak
- Mailhog

**Backend**

- NestJS (microservices + `@nestjs/microservices`)
- ORM: Prisma ou TypeORM (escolhemos depois, mas o design já prevê outbox)
- Processamento:
  - imagens: `sharp` (thumbnail + metadata)

**Frontend**

- **React + Vite** (recomendado para admin e user)

> Next.js também funciona, mas Vite vai te dar menos atrito no começo e é perfeito para apps internos.

---

## 4) Serviços e responsabilidades

### 4.1 Frontends

- **user-web**
  - login (Keycloak)
  - upload + acompanhamento do status do processamento
  - lista “meus uploads”

- **admin-web**
  - visão global de uploads/processamentos
  - reprocessar/forçar retry (via comando)
  - visualizar erros e DLQ (opcional via endpoints)

### 4.2 Backend (microserviços)

1. **api-gateway** (HTTP/BFF)

- Expõe REST para os frontends
- Valida JWT do Keycloak (RBAC: user/admin)
- Publica **Commands** no RabbitMQ e retorna `correlationId`/`fileId`
- Fornece endpoints de leitura consultando **read model** (projection)

2. **upload-service** (Command handler)

- Recebe comando `UploadRequested`
- Gera presigned URL (MinIO) **ou** aceita upload via gateway (decidimos no MVP)
- Persiste `file` + `outbox_events`
- Publica `FileUploaded.v1`

3. **validator-service** (Event consumer)

- Consome `FileUploaded.v1`
- Valida (mime, tamanho, assinatura, integridade)
- Publica `FileValidated.v1` ou `FileRejected.v1`

4. **thumbnail-service** (Event consumer)

- Consome `FileValidated.v1`
- Gera thumbnail e salva no MinIO (`thumbnails/`)
- Publica `ThumbnailGenerated.v1`

5. **extractor-service** (Event consumer)

- Consome `FileValidated.v1`
- Extrai metadata (ex: width/height, checksum, etc.)
- Publica `MetadataExtracted.v1`

6. **projection-service** (Read model / CQRS)

- Consome _todos_ eventos relevantes
- Mantém tabelas otimizadas para leitura:
  - status por etapa
  - histórico/timeline
  - listagens para admin/user

- É o “banco” que a UI consulta

7. **notification-service** (opcional mas incluído)

- Consome eventos (ex: `ProcessingCompleted.v1`, `FileRejected.v1`)
- Envia e-mail via SMTP no **Mailhog**
- (opcional) publica `NotificationSent.v1`

8. **audit-service** (opcional mas incluído)

- Consome todos eventos (ou subset)
- Persiste **audit log imutável**
- Ajuda em rastreabilidade e debugging

---

## 5) Comunicação entre componentes

### 5.1 Padrão geral

- **HTTP (sync):** frontends → api-gateway (apenas)
- **RabbitMQ (async):** gateway → serviços (commands), serviços → serviços (events)
- **Postgres:** cada serviço é dono do seu modelo (preferência: DB/schema por serviço)
- **MinIO:** armazenamento binário (upload + thumbnail)

### 5.2 Commands vs Events

- **Commands**: ponto-a-ponto, direcionados a 1 serviço (“faça X”)
  - Ex: `UploadRequested`, `ReprocessFileRequested`

- **Events**: publish/subscribe, múltiplos serviços podem reagir (“X aconteceu”)
  - Ex: `FileUploaded.v1`, `FileValidated.v1`, etc.

> No RabbitMQ, normalmente:

- Commands → **fila direta** (`q.upload.commands`, `q.admin.commands`, etc.)
- Events → **exchange topic** `domain.events` com routing keys

---

## 6) Topologia do RabbitMQ (proposta)

### Exchanges

- `domain.events` (tipo: topic) → eventos
- `domain.commands` (tipo: direct/topic) → comandos

### Routing keys (exemplos)

- `files.uploaded.v1`
- `files.validated.v1`
- `files.rejected.v1`
- `thumbs.generated.v1`
- `metadata.extracted.v1`
- `processing.completed.v1`
- `commands.upload.requested.v1`
- `commands.file.reprocess.v1`

### Queues (exemplos)

- `q.upload.commands` (bind `commands.upload.*`)
- `q.validator` (bind `files.uploaded.*`)
- `q.thumbnail` (bind `files.validated.*`)
- `q.extractor` (bind `files.validated.*`)
- `q.projection` (bind `#`)
- `q.notification` (bind `processing.*`, `files.rejected.*`)
- `q.audit` (bind `#`)

### DLQ / Retry

Para cada queue:

- `q.X` com `x-dead-letter-exchange` → `dlx.X`
- retries via TTL + dead-letter (ou lib de retry)
- `q.X.dlq` para falhas finais

---

## 7) Contrato de mensagens (Envelope)

Adotaremos um envelope único para todo mundo:

```ts
type MessageEnvelope<T> = {
  eventId: string; // uuid
  type: string; // e.g. "FileUploaded.v1"
  occurredAt: string; // ISO date
  correlationId: string; // rastrear o fluxo inteiro
  causationId?: string; // evento que causou esse
  producer: string; // service name
  payload: T; // dados do evento/command
  version: number; // versão do schema (além do sufixo .v1)
};
```

**Regras**

- `payload` deve ser **mínimo necessário** (evitar acoplamento)
- Identificadores consistentes: `fileId`, `bucket`, `objectKey`, `tenantId?`, `userId?`

---

## 8) Fluxo principal (pipeline)

### 8.1 Sequência (alto nível)

```mermaid
sequenceDiagram
  participant U as user-web
  participant G as api-gateway
  participant MQ as RabbitMQ
  participant UP as upload-service
  participant V as validator-service
  participant T as thumbnail-service
  participant E as extractor-service
  participant P as projection-service
  participant N as notification-service
  participant S3 as MinIO
  participant DB as Postgres

  U->>G: POST /uploads (auth JWT)
  G->>MQ: Command UploadRequested
  MQ->>UP: UploadRequested
  UP->>S3: save object (or presigned flow)
  UP->>DB: file + outbox (tx)
  UP->>MQ: Event FileUploaded.v1 (via outbox publisher)

  MQ->>V: FileUploaded.v1
  V->>MQ: FileValidated.v1 or FileRejected.v1

  MQ->>T: FileValidated.v1
  T->>S3: write thumbnail
  T->>MQ: ThumbnailGenerated.v1

  MQ->>E: FileValidated.v1
  E->>MQ: MetadataExtracted.v1

  MQ->>P: all events
  P->>DB: update read model (status/timeline)

  MQ->>N: ProcessingCompleted.v1 or FileRejected.v1
  N->>Mailhog: send email
```

### 8.2 Como a UI “vê” o status

- user/admin chama `GET /uploads/:fileId/status`
- gateway lê do **projection-service DB** (read model)
- opcional: `notification-service` expõe SSE/WebSocket para push

---

## 9) Requisitos funcionais (RF)

**RF-01** Autenticação e autorização

- Login via Keycloak
- Perfis: `user` e `admin`

**RF-02** Upload de arquivo

- Usuário consegue iniciar upload e receber `fileId` + `correlationId`

**RF-03** Pipeline por etapas

- Ao receber upload, o sistema executa:
  1. validação
  2. thumbnail
  3. extração de metadata
  4. finalização (completado/erro)

**RF-04** Status do processamento

- Usuário e admin conseguem ver status por etapa (pending/processing/done/failed)

**RF-05** Histórico/timeline

- Cada evento relevante aparece na timeline do upload

**RF-06** Admin: reprocessar

- Admin pode disparar `ReprocessFileRequested` (com nova correlationId)

**RF-07** Notificações por e-mail (simulado)

- Ao completar ou falhar, enviar e-mail para Mailhog (para inspeção)

**RF-08** Auditoria

- Persistir auditoria de eventos (mínimo: tipo, occurredAt, correlationId, payload resumido)

---

## 10) Requisitos não funcionais (RNF)

**RNF-01** Confiabilidade de publicação (Outbox)

- Eventos só são publicados após commit da transação

**RNF-02** Idempotência em consumers

- Cada consumer deve ignorar duplicatas (por `eventId` + store local)

**RNF-03** Retry e DLQ

- Falhas temporárias → retry automático
- Falhas permanentes → DLQ com visibilidade no admin

**RNF-04** Observabilidade básica

- Logs estruturados com `correlationId`
- Métricas (opcional v0.2)

**RNF-05** Segurança local

- JWT verificado no gateway
- serviços internos não expostos fora do compose network

**RNF-06** Evolução de contrato

- Eventos versionados (`.v1`, `.v2`)
- Compatibilidade backward sempre que possível

---

## 11) Conectando tudo (visão de arquitetura)

```mermaid
flowchart LR
  subgraph Front
    UW[user-web (Vite)]
    AW[admin-web (Vite)]
  end

  subgraph Edge
    GW[api-gateway (Nest HTTP)]
  end

  subgraph Broker
    MQ[(RabbitMQ)]
  end

  subgraph Services
    UP[upload-service]
    VA[validator-service]
    TH[thumbnail-service]
    EX[extractor-service]
    PR[projection-service]
    NO[notification-service]
    AU[audit-service]
  end

  subgraph Infra
    PG[(Postgres)]
    S3[(MinIO)]
    KC[(Keycloak)]
    MH[(Mailhog)]
  end

  UW -->|HTTP + JWT| GW
  AW -->|HTTP + JWT| GW
  GW -->|validate token| KC

  GW -->|commands| MQ
  MQ --> UP
  MQ --> VA
  MQ --> TH
  MQ --> EX
  MQ --> PR
  MQ --> NO
  MQ --> AU

  UP --> PG
  PR --> PG
  AU --> PG
  UP --> S3
  TH --> S3
  NO --> MH
```

---

## 12) Estrutura de repositório (sugestão)

Monorepo facilita muito localmente:

- `apps/user-web` (Vite)
- `apps/admin-web` (Vite)
- `services/api-gateway`
- `services/upload-service`
- `services/validator-service`
- `services/thumbnail-service`
- `services/extractor-service`
- `services/projection-service`
- `services/notification-service`
- `services/audit-service`
- `infra/docker-compose.yml`
- `packages/shared` (tipos de mensagens, util de correlationId, libs comuns)

---

## 13) Próximos passos (para fechar o planejamento)

1. Definir o **MVP do upload**:
   - via gateway (multipart) **ou** presigned direto no MinIO (mais realista)

2. Definir estratégia de DB:
   - 1 Postgres com **1 database por serviço** (recomendado)
     **ou** 1 DB com **schemas por serviço**

3. Definir read model mínimo:
   - `uploads` + `upload_steps` + `upload_timeline`

4. Fechar lista oficial de eventos v1 e payloads mínimos

---
