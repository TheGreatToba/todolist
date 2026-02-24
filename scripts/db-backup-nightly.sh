#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/todolist}"
APP_ROOT="${APP_ROOT:-$(pwd)}"
DUMP_RETENTION_DAYS="${DUMP_RETENTION_DAYS:-14}"
BASE_RETENTION_DAYS="${BASE_RETENTION_DAYS:-7}"
ENABLE_PITR_BASE_BACKUP="${ENABLE_PITR_BASE_BACKUP:-false}"
BASE_BACKUP_DATABASE_URL="${BASE_BACKUP_DATABASE_URL:-}"

require_command realpath
require_command pg_dump
require_command pg_restore
require_command sha256sum
if [[ "${ENABLE_PITR_BASE_BACKUP}" == "true" ]]; then
  require_command pg_basebackup
  if [[ -z "${BASE_BACKUP_DATABASE_URL}" ]]; then
    echo "BASE_BACKUP_DATABASE_URL is required when ENABLE_PITR_BASE_BACKUP=true." >&2
    echo "Use a PostgreSQL role with REPLICATION privileges for pg_basebackup." >&2
    exit 1
  fi
fi

BACKUP_ROOT_REAL="$(realpath -m "${BACKUP_ROOT}")"
APP_ROOT_REAL="$(realpath -m "${APP_ROOT}")"
if [[ "${BACKUP_ROOT_REAL}" == "${APP_ROOT_REAL}"* ]]; then
  echo "BACKUP_ROOT (${BACKUP_ROOT_REAL}) must be outside APP_ROOT (${APP_ROOT_REAL})." >&2
  exit 1
fi

STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
DUMP_DIR="${BACKUP_ROOT_REAL}/dumps"
BASE_DIR="${BACKUP_ROOT_REAL}/base"
WAL_DIR="${BACKUP_ROOT_REAL}/wal"
mkdir -p "${DUMP_DIR}" "${BASE_DIR}" "${WAL_DIR}"

DUMP_FILE="${DUMP_DIR}/todolist_${STAMP}.dump"
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Creating logical dump: ${DUMP_FILE}"
pg_dump \
  --dbname="${DATABASE_URL}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="${DUMP_FILE}"

sha256sum "${DUMP_FILE}" > "${DUMP_FILE}.sha256"
pg_restore --list "${DUMP_FILE}" > "${DUMP_FILE}.manifest"

if [[ "${ENABLE_PITR_BASE_BACKUP}" == "true" ]]; then
  BASE_TARGET_DIR="${BASE_DIR}/base_${STAMP}"
  mkdir -p "${BASE_TARGET_DIR}"
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Creating base backup for PITR: ${BASE_TARGET_DIR}"
  pg_basebackup \
    --dbname="${BASE_BACKUP_DATABASE_URL}" \
    --pgdata="${BASE_TARGET_DIR}" \
    --format=tar \
    --gzip \
    --checkpoint=fast \
    --wal-method=stream
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Applying retention policy"
find "${DUMP_DIR}" -type f -name "todolist_*.dump*" -mtime +"${DUMP_RETENTION_DAYS}" -delete
find "${BASE_DIR}" -mindepth 1 -maxdepth 1 -type d -name "base_*" -mtime +"${BASE_RETENTION_DAYS}" -exec rm -rf {} +

if [[ -n "${BACKUP_SYNC_COMMAND:-}" ]]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Running BACKUP_SYNC_COMMAND"
  BACKUP_PATH="${BACKUP_ROOT_REAL}" eval "${BACKUP_SYNC_COMMAND}"
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup complete"
