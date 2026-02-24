# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends procps \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS dev
CMD ["pnpm", "--filter", "@event-pipeline/notification-service", "dev"]

FROM deps AS build
RUN pnpm --filter @event-pipeline/shared build && pnpm --filter @event-pipeline/notification-service build

FROM node:22-bookworm-slim AS prod
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
WORKDIR /workspace
RUN corepack enable
COPY --from=build /workspace /workspace
WORKDIR /workspace/services/notification-service
CMD ["pnpm", "run", "start:prod"]
