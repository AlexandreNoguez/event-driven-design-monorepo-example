#!/usr/bin/env bash

set -euo pipefail

COMPOSE=(docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml)
POSTGRES_USER_VALUE="${POSTGRES_USER:-postgres}"
POSTGRES_DB_VALUE="${POSTGRES_DB:-event_pipeline}"

compose_exec() {
  "${COMPOSE[@]}" exec -T "$@"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

echo "[smoke] running full E2E flow..."

context_output="$(compose_exec api-gateway node - <<'NODE'
const payload = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+lmYsAAAAASUVORK5CYII=',
  'base64',
);
const now = new Date().toISOString().replace(/[:.]/g, '-');
const fileName = `smoke-${now}.png`;
const correlationId = `smoke-${Date.now()}`;

async function run() {
  const tokenResp = await fetch('http://keycloak:8080/realms/event-pipeline/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: 'api-gateway',
      client_secret: 'dev-api-gateway-secret',
    }),
  });

  if (!tokenResp.ok) {
    throw new Error(`token request failed: ${tokenResp.status} ${await tokenResp.text()}`);
  }

  const token = (await tokenResp.json()).access_token;
  if (!token) {
    throw new Error('token missing in keycloak response');
  }

  const createResp = await fetch('http://127.0.0.1:3000/uploads', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify({
      fileName,
      contentType: 'image/png',
      sizeBytes: payload.length,
    }),
  });

  if (!createResp.ok) {
    throw new Error(`create upload failed: ${createResp.status} ${await createResp.text()}`);
  }

  const created = await createResp.json();
  const uploadUrl = created?.upload?.url;
  const fileId = created?.fileId;
  if (!fileId || !uploadUrl) {
    throw new Error('invalid create upload response');
  }

  const putHeaders = new Headers();
  putHeaders.set('content-type', 'image/png');
  for (const [key, value] of Object.entries(created.upload.requiredHeaders ?? {})) {
    if (typeof value === 'string' && value.length > 0) {
      putHeaders.set(key, value);
    }
  }

  const putResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: putHeaders,
    body: payload,
  });

  if (!putResp.ok) {
    throw new Error(`minio put failed: ${putResp.status} ${await putResp.text()}`);
  }

  const confirmResp = await fetch(`http://127.0.0.1:3000/uploads/${fileId}/confirm`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-correlation-id': correlationId,
    },
    body: JSON.stringify({
      eTag: putResp.headers.get('etag') ?? undefined,
    }),
  });

  if (!confirmResp.ok) {
    throw new Error(`confirm upload failed: ${confirmResp.status} ${await confirmResp.text()}`);
  }

  await confirmResp.json();

  console.log(`SMOKE_FILE_ID=${fileId}`);
  console.log(`SMOKE_CORRELATION_ID=${correlationId}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`SMOKE_ERROR=${message}`);
  process.exit(1);
});
NODE
)"

file_id="$(printf '%s\n' "$context_output" | awk -F= '/^SMOKE_FILE_ID=/{print $2}')"
correlation_id="$(printf '%s\n' "$context_output" | awk -F= '/^SMOKE_CORRELATION_ID=/{print $2}')"

if [[ -z "$file_id" || -z "$correlation_id" ]]; then
  echo "[smoke] failed to parse smoke context"
  printf '%s\n' "$context_output"
  exit 1
fi

echo "[smoke] file_id=$file_id correlation_id=$correlation_id"

projection_status=""
for _attempt in $(seq 1 30); do
  projection_status="$(compose_exec postgres psql -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" -t -A -c \
    "select coalesce(overall_status, '') from projection_service.uploads_read where file_id = '$file_id' limit 1;")"
  projection_status="$(trim "$projection_status")"

  if [[ "$projection_status" == "completed" ]]; then
    break
  fi

  sleep 2
done

if [[ "$projection_status" != "completed" ]]; then
  echo "[smoke] expected projection status=completed, got '$projection_status'"
  exit 1
fi

audit_count=""
processing_completed_count=""
saga_match_count=""
for _attempt in $(seq 1 30); do
  audit_count="$(compose_exec postgres psql -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" -t -A -c \
    "select count(*) from audit_service.audit_events where correlation_id = '$correlation_id';")"
  audit_count="$(trim "$audit_count")"
  processing_completed_count="$(compose_exec postgres psql -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" -t -A -c \
    "select count(*) from audit_service.audit_events where correlation_id = '$correlation_id' and event_type = 'ProcessingCompleted.v1';")"
  processing_completed_count="$(trim "$processing_completed_count")"
  saga_match_count="$(compose_exec postgres psql -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" -t -A -c \
    "select count(*) from processing_manager.processing_sagas where file_id = '$file_id' and correlation_id = '$correlation_id' and status = 'completed' and comparison_status = 'match';")"
  saga_match_count="$(trim "$saga_match_count")"
  if [[ -n "$audit_count" && "$audit_count" -ge 5 && -n "$processing_completed_count" && "$processing_completed_count" -ge 1 && -n "$saga_match_count" && "$saga_match_count" -ge 1 ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$audit_count" || "$audit_count" -lt 5 ]]; then
  echo "[smoke] expected >=5 audit events for correlation '$correlation_id', got '$audit_count'"
  exit 1
fi

if [[ -z "$processing_completed_count" || "$processing_completed_count" -lt 1 ]]; then
  echo "[smoke] expected ProcessingCompleted.v1 in audit trail for correlation '$correlation_id', got '$processing_completed_count'"
  exit 1
fi

if [[ -z "$saga_match_count" || "$saga_match_count" -lt 1 ]]; then
  echo "[smoke] expected a completed/match processing saga row for file '$file_id', got '$saga_match_count'"
  exit 1
fi

notification_sent_count=""
for _attempt in $(seq 1 30); do
  notification_sent_count="$(compose_exec postgres psql -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" -t -A -c \
    "select count(*) from notification_service.notification_logs where file_id = '$file_id' and status = 'sent';")"
  notification_sent_count="$(trim "$notification_sent_count")"
  if [[ -n "$notification_sent_count" && "$notification_sent_count" -ge 1 ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$notification_sent_count" || "$notification_sent_count" -lt 1 ]]; then
  echo "[smoke] expected sent notification for file '$file_id', got '$notification_sent_count'"
  exit 1
fi

mailhog_match_count=""
for _attempt in $(seq 1 30); do
  mailhog_match_count="$(compose_exec api-gateway node -e "
const correlationId = '$correlation_id';
const hasHeader = (headers, name) => {
  if (!headers || typeof headers !== 'object') return false;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    if (Array.isArray(value)) return value.includes(correlationId);
    return String(value) === correlationId;
  }
  return false;
};
fetch('http://mailhog:8025/api/v2/messages')
  .then((response) => response.json())
  .then((payload) => {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const count = items.filter((item) => hasHeader(item?.Content?.Headers, 'x-correlation-id')).length;
    console.log(count);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
  ")"
  mailhog_match_count="$(trim "$mailhog_match_count")"
  if [[ -n "$mailhog_match_count" && "$mailhog_match_count" -ge 1 ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$mailhog_match_count" || "$mailhog_match_count" -lt 1 ]]; then
  echo "[smoke] expected at least one Mailhog message with x-correlation-id '$correlation_id', got '$mailhog_match_count'"
  exit 1
fi

echo "[smoke] projection=completed audit_events=$audit_count processing_completed_events=$processing_completed_count saga_matches=$saga_match_count notification_sent=$notification_sent_count mailhog_matches=$mailhog_match_count"
echo "[smoke] SUCCESS"
