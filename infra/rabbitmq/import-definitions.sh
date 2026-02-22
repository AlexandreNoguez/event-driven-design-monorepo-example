#!/bin/sh
set -eu

RABBITMQ_HTTP_HOST="${RABBITMQ_HTTP_HOST:-rabbitmq}"
RABBITMQ_HTTP_PORT="${RABBITMQ_HTTP_PORT:-15672}"
RABBITMQ_USER="${RABBITMQ_USER:-event}"
RABBITMQ_PASSWORD="${RABBITMQ_PASSWORD:-event}"
RABBITMQ_SCHEME="${RABBITMQ_SCHEME:-http}"
RABBITMQ_API_BASE="${RABBITMQ_SCHEME}://${RABBITMQ_HTTP_HOST}:${RABBITMQ_HTTP_PORT}/api"

echo "Aguardando RabbitMQ Management API em ${RABBITMQ_API_BASE}..."
attempt=0
until curl -fsS -u "${RABBITMQ_USER}:${RABBITMQ_PASSWORD}" "${RABBITMQ_API_BASE}/overview" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 60 ]; then
    echo "Falha ao conectar no RabbitMQ Management API apos ${attempt} tentativas."
    exit 1
  fi
  sleep 2
done

echo "Importando definitions do RabbitMQ..."
curl -fsS \
  -u "${RABBITMQ_USER}:${RABBITMQ_PASSWORD}" \
  -H 'content-type: application/json' \
  -X POST \
  "${RABBITMQ_API_BASE}/definitions" \
  --data-binary @/definitions.json >/dev/null

echo "Definitions do RabbitMQ importadas com sucesso."
