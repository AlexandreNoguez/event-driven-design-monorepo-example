# ADR 0001: Adotar Saga coreografada com Process Manager explícito (v0.2)

- Status: `Accepted (roadmap v0.2)`
- Data: `2026-02-24`

## Contexto

O pipeline já opera em arquitetura event-driven com RabbitMQ, outbox e idempotência.

No MVP atual, a regra de conclusão do processamento (`ProcessingCompleted.v1`) é derivada no `projection-service`, que também mantém o read model.

Isso funciona para o MVP, mas mistura responsabilidades:

- projeção para consulta
- coordenação implícita de processo distribuído

## Decisão

O projeto adotará, em evolução futura (v0.2), uma **Saga coreografada com Process Manager explícito** para coordenar o ciclo de processamento por arquivo.

A Saga deverá:

- acompanhar estado por `fileId` / `correlationId`
- tratar timeouts e estados terminais
- publicar eventos de término (`ProcessingCompleted.v1`, `ProcessingFailed.v1`, `ProcessingTimedOut.v1`)

## Alternativas consideradas

### 1. Manter coordenação implícita no `projection-service`

- Prós: menor custo imediato
- Contras: acoplamento de read model com coordenação de processo; difícil evoluir timeouts/compensações

### 2. Saga orquestrada com coordenador central por commands

- Prós: fluxo explícito e didático
- Contras: maior acoplamento e complexidade para o estágio atual; desnecessário para o MVP

## Consequências

- Evolução incremental sem reescrever o pipeline atual
- Melhor separação de responsabilidades (read model vs coordenação)
- Mais testabilidade para regras de conclusão/falha/timeout
- Exige novo modelo de persistência da saga e observabilidade específica

## Notas de implementação (planejadas)

- Adoção por etapas, com possível fase "shadow" antes de transferir o producer de `ProcessingCompleted.v1`
- Manter outbox/idempotência como requisitos obrigatórios para o Process Manager
