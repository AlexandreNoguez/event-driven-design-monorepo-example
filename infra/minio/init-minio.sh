#!/bin/sh
set -eu

MINIO_INTERNAL_URL="${MINIO_INTERNAL_URL:-http://minio:9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minioadmin}"
MINIO_BUCKET_UPLOADS="${MINIO_BUCKET_UPLOADS:-uploads}"
MINIO_BUCKET_THUMBNAILS="${MINIO_BUCKET_THUMBNAILS:-thumbnails}"

echo "Aguardando MinIO em ${MINIO_INTERNAL_URL}..."
attempt=0
until mc alias set local "${MINIO_INTERNAL_URL}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "${attempt}" -ge 60 ]; then
    echo "Falha ao conectar no MinIO apos ${attempt} tentativas."
    exit 1
  fi
  sleep 2
done

echo "Criando buckets (idempotente)..."
mc mb --ignore-existing "local/${MINIO_BUCKET_UPLOADS}"
mc mb --ignore-existing "local/${MINIO_BUCKET_THUMBNAILS}"

echo "Aplicando policies..."
if ! mc anonymous set private "local/${MINIO_BUCKET_UPLOADS}"; then
  mc policy set none "local/${MINIO_BUCKET_UPLOADS}"
fi

if ! mc anonymous set download "local/${MINIO_BUCKET_THUMBNAILS}"; then
  mc policy set download "local/${MINIO_BUCKET_THUMBNAILS}"
fi

echo "MinIO inicializado com buckets '${MINIO_BUCKET_UPLOADS}' e '${MINIO_BUCKET_THUMBNAILS}'."
