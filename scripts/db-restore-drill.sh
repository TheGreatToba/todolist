#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command psql
require_command pg_restore
require_command tar

if [[ -z "${BACKUP_FILE:-}" ]]; then
  echo "BACKUP_FILE is required (path to pg_dump -Fc file)." >&2
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

RESTORE_DB="${RESTORE_DB:-todolist_restore_drill}"
PGDATABASE="${PGDATABASE:-postgres}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Recreating restore database: ${RESTORE_DB}"
psql -v ON_ERROR_STOP=1 -d "${PGDATABASE}" -c "DROP DATABASE IF EXISTS \"${RESTORE_DB}\";"
psql -v ON_ERROR_STOP=1 -d "${PGDATABASE}" -c "CREATE DATABASE \"${RESTORE_DB}\";"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Restoring logical backup into ${RESTORE_DB}"
pg_restore \
  --verbose \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="${RESTORE_DB}" \
  "${BACKUP_FILE}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Running sanity checks on ${RESTORE_DB}"
psql -v ON_ERROR_STOP=1 -d "${RESTORE_DB}" <<'SQL'
SELECT to_regclass('"User"') AS user_table;
SELECT to_regclass('"TaskTemplate"') AS task_template_table;
SELECT to_regclass('"DailyTask"') AS daily_task_table;
SELECT COUNT(*) AS users_count FROM "User";
SELECT COUNT(*) AS teams_count FROM "Team";
SELECT COUNT(*) AS templates_count FROM "TaskTemplate";
SELECT COUNT(*) AS daily_tasks_count FROM "DailyTask";
SQL

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Logical restore drill complete"

if [[ -n "${PITR_TARGET_TIME:-}" ]]; then
  if [[ -z "${BASE_BACKUP_DIR:-}" || -z "${WAL_ARCHIVE_DIR:-}" ]]; then
    echo "PITR_TARGET_TIME is set, but BASE_BACKUP_DIR or WAL_ARCHIVE_DIR is missing." >&2
    exit 1
  fi

  if [[ ! -d "${BASE_BACKUP_DIR}" ]]; then
    echo "BASE_BACKUP_DIR not found: ${BASE_BACKUP_DIR}" >&2
    exit 1
  fi

  if [[ ! -d "${WAL_ARCHIVE_DIR}" ]]; then
    echo "WAL_ARCHIVE_DIR not found: ${WAL_ARCHIVE_DIR}" >&2
    exit 1
  fi

  PITR_PORT="${PITR_PORT:-55432}"
  PITR_HOST="${PITR_HOST:-127.0.0.1}"
  PITR_PGDATA_DIR="${PITR_PGDATA_DIR:-/tmp/todolist-pitr-${PITR_PORT}}"

  require_command pg_ctl

  BASE_TAR="$(find "${BASE_BACKUP_DIR}" -maxdepth 1 -type f -name "base.tar*" | head -n 1)"
  WAL_TAR="$(find "${BASE_BACKUP_DIR}" -maxdepth 1 -type f -name "pg_wal.tar*" | head -n 1)"

  if [[ -z "${BASE_TAR}" ]]; then
    echo "Could not find base.tar(.gz) in ${BASE_BACKUP_DIR}" >&2
    exit 1
  fi

  rm -rf "${PITR_PGDATA_DIR}"
  mkdir -p "${PITR_PGDATA_DIR}"

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Restoring base backup into ${PITR_PGDATA_DIR}"
  if [[ "${BASE_TAR}" == *.gz ]]; then
    tar -xzf "${BASE_TAR}" -C "${PITR_PGDATA_DIR}"
  else
    tar -xf "${BASE_TAR}" -C "${PITR_PGDATA_DIR}"
  fi
  if [[ -n "${WAL_TAR}" ]]; then
    if [[ "${WAL_TAR}" == *.gz ]]; then
      tar -xzf "${WAL_TAR}" -C "${PITR_PGDATA_DIR}"
    else
      tar -xf "${WAL_TAR}" -C "${PITR_PGDATA_DIR}"
    fi
  fi

  cat >> "${PITR_PGDATA_DIR}/postgresql.auto.conf" <<EOF
restore_command = 'cp ${WAL_ARCHIVE_DIR}/%f %p'
recovery_target_time = '${PITR_TARGET_TIME}'
recovery_target_action = 'pause'
EOF
  touch "${PITR_PGDATA_DIR}/recovery.signal"

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting temporary PITR instance on port ${PITR_PORT}"
  pg_ctl -D "${PITR_PGDATA_DIR}" -o "-p ${PITR_PORT}" -w start

  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] PITR state checks"
  PITR_DB="$(psql -h "${PITR_HOST}" -p "${PITR_PORT}" -U "${PGUSER:-postgres}" -d postgres -Atqc "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1') ORDER BY datname LIMIT 1")"
  if [[ -z "${PITR_DB}" ]]; then
    echo "No user database found in PITR instance." >&2
    pg_ctl -D "${PITR_PGDATA_DIR}" -m fast stop
    exit 1
  fi

  psql -h "${PITR_HOST}" -p "${PITR_PORT}" -U "${PGUSER:-postgres}" -d "${PITR_DB}" -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_is_in_recovery() AS in_recovery;
SELECT now() AS replay_time;
SELECT COUNT(*) AS users_count FROM "User";
SELECT COUNT(*) AS teams_count FROM "Team";
SQL

  pg_ctl -D "${PITR_PGDATA_DIR}" -m fast stop
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] PITR drill complete"
fi
