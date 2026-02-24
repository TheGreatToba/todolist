#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command cp
require_command mv

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <wal_source_path> <wal_file_name>" >&2
  exit 1
fi

WAL_SOURCE_PATH="$1"
WAL_FILE_NAME="$2"
WAL_ARCHIVE_DIR="${WAL_ARCHIVE_DIR:-/var/backups/todolist/wal}"

mkdir -p "${WAL_ARCHIVE_DIR}"

if [[ ! -f "${WAL_SOURCE_PATH}" ]]; then
  echo "WAL source file not found: ${WAL_SOURCE_PATH}" >&2
  exit 1
fi

TARGET_PATH="${WAL_ARCHIVE_DIR}/${WAL_FILE_NAME}"
if [[ -f "${TARGET_PATH}" ]]; then
  exit 0
fi

TMP_PATH="${TARGET_PATH}.tmp"
cp "${WAL_SOURCE_PATH}" "${TMP_PATH}"
mv "${TMP_PATH}" "${TARGET_PATH}"

if [[ -n "${WAL_SYNC_COMMAND:-}" ]]; then
  WAL_FILE_PATH="${TARGET_PATH}" eval "${WAL_SYNC_COMMAND}"
fi

exit 0
