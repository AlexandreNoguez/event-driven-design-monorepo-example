# Configuração por Serviço e Docker (Pré-Item 6)

Este documento registra a fase de padronização de configuração e empacotamento local/prod antes do item `6` (catálogo de eventos).

## Objetivos

- Remover dependência de `source ../../.env` para subir serviços NestJS
- Tornar cada backend executável de forma isolada (mais próximo de produção)
- Criar base de Docker para desenvolvimento (hot reload) e produção
- Permitir `docker compose` de stack completa com um único comando

## Estratégia de configuração (backends NestJS)

### Padrão

- `@nestjs/config` em cada backend
- `ConfigModule.forRoot({ isGlobal: true, validate, envFilePath })`
- Validação fail-fast por serviço (mensagens claras de erro)
- `.env` por serviço:
  - `services/<service>/.env`
  - `services/<service>/.env.local` (gitignored)
- Fallback opcional durante transição:
  - `../../.env`
  - `../../.env.local`

### Regras

- `main.ts` não deve depender de `source` shell para ler env
- Scripts `start/dev` devem ser portáveis (Linux/macOS/Windows via Node/Nest)
- Variáveis compartilhadas (ex.: `DATABASE_URL`, `RABBITMQ_URL`) podem repetir por serviço para isolamento

## Estratégia de Docker

### Dockerfile por backend (único, multi-stage)

Cada serviço terá um único `Dockerfile` com stages:

- `dev`: hot reload (`pnpm ... dev`)
- `build`: compila artefatos
- `prod`: executa `node dist/...`

Motivação:

- evita duplicação entre `Dockerfile.dev` e `Dockerfile`
- mantém consistência entre ambientes
- facilita `docker compose` com `target`

### Compose

Arquivos:

- `infra/docker-compose.yml` (infra base)
- `infra/docker-compose.dev.yml` (backends com hot reload)

Scripts raiz:

- `pnpm docker:up` => stack completa dev (`infra + backends`)
- `pnpm docker:up:infra` => somente infra
- `pnpm docker:down`
- `pnpm docker:logs`

## Ordem de implementação (aprovada)

1. Config por serviço (`upload-service` + `validator-service`) com `@nestjs/config` + validação
2. Replicar para demais backends
3. `.env.example` por serviço
4. Limpar scripts `start/dev`
5. Dockerfiles multi-stage dos backends
6. Compose full dev (`infra` + `backends`)
7. Atualizar `README.md`
8. Depois (itens 8/9), adicionar Dockerfiles/compose dos frontends

## Status atual

- `upload-service` e `validator-service` usados como template de `@nestjs/config` + validação
- Padrão replicado para todos os backends (`api-gateway` + workers)
- `.env.example` por backend criado
- Scripts `start/dev` limpos (sem `source` manual)
- Dockerfiles multi-stage (`dev`/`build`/`prod`) criados para os 8 backends
- `infra/docker-compose.dev.yml` criado para stack full dev (`infra + backends`) com hot reload
- Scripts raiz adicionados/ajustados: `docker:up`, `docker:down`, `docker:up:infra`, `docker:down:infra`, `docker:logs`
- Merge/estrutura do compose validado com `docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml config`

## Próximos passos após esta fase

- Avançar para o item `6` (catálogo de eventos/contratos v1)
- Nos itens `8/9`, adicionar Dockerfiles/compose dos frontends (`user-web` e `admin-web`)
