# PostgreSQL Production Runbook

This is the go-live database runbook for Ticket 3.

## 1. Prisma Schema and Migration Baseline

- Unified schema file: `prisma/schema.prisma`
- Provider: `postgresql`
- Migration lock provider: `prisma/migrations/migration_lock.toml` => `postgresql`
- Baseline migration: `prisma/migrations/20260223170000_init_postgresql/migration.sql`
- Incremental production migration: `prisma/migrations/20260224103000_backfill_dailytask_snapshots/migration.sql`
- Removed split schema: `prisma/schema.postgresql.prisma`

The baseline migration includes all current models and the partial unique historical index:

- `DailyTask_historical_templateSource_employee_date_unique`
- DailyTask snapshot backfill SQL (`UPDATE ... FROM TaskTemplate`) is included in the incremental migration above.

No SQLite migration path remains in production.

## 2. Migration Commands

### Development

```bash
# Set a local PostgreSQL URL first
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/todolist_dev?schema=public'

# Apply committed migrations
pnpm exec prisma migrate deploy

# Optional demo data
pnpm run seed

# For future schema changes:
pnpm exec prisma migrate dev --name <change_name>
```

### Production deployment

```bash
export DATABASE_URL='postgresql://app_user:app_password@127.0.0.1:5432/todolist?schema=public'
pnpm exec prisma migrate deploy
```

Optional operational re-run (safe, idempotent) for legacy rows if needed:

```bash
pnpm backfill:dailytask-snapshots --dry-run
pnpm backfill:dailytask-snapshots
```

Notes:

- Use `migrate deploy` in production only.
- Do not use `migrate reset` in production.
- If migration fails, stop rollout and restore from backup before retrying.

### Upgrade path for an existing PostgreSQL database (already migrated before re-baseline)

If a PostgreSQL environment already has legacy Prisma migration history, do **not** run `migrate deploy` directly.

1. Take a backup first.
2. Verify the live schema matches the unified Prisma schema:

```bash
export DATABASE_URL='postgresql://app_user:app_password@127.0.0.1:5432/todolist?schema=public'
pnpm exec prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
```

Expected result: exit code `0` (no schema diff).

3. Verify custom SQL objects not represented in Prisma schema (required before re-baseline):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'DailyTask_historical_templateSource_employee_date_unique';"
```

Expected result: one row with `DailyTask_historical_templateSource_employee_date_unique`.

4. Re-baseline migration metadata (only if steps 2 and 3 pass):

Run this with a migration owner/admin role (must be allowed to truncate `_prisma_migrations`).

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'TRUNCATE TABLE "_prisma_migrations";'
pnpm exec prisma migrate resolve --applied 20260223170000_init_postgresql
pnpm exec prisma migrate deploy
```

5. Validate:

```bash
pnpm exec prisma migrate status
```

If step 2 reports differences, stop and perform a manual schema reconciliation plan before re-baselining metadata.

## 3. PostgreSQL Durability Settings

Set in `postgresql.conf`:

```conf
fsync = on
synchronous_commit = on
full_page_writes = on
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/backups/todolist/wal/%f && /opt/todolist/scripts/pg-wal-archive.sh "%p" "%f"'
```

Validate:

```sql
SHOW fsync;
SHOW synchronous_commit;
SHOW full_page_writes;
SHOW wal_level;
SHOW archive_mode;
SHOW archive_command;
```

## 4. Backup Automation

Script: `scripts/db-backup-nightly.sh`

Features:

- Nightly full logical backup with `pg_dump -Fc`
- SHA-256 checksum + dump manifest
- Optional physical base backup (`pg_basebackup`) for PITR drills (disabled by default)
- Retention cleanup
- Optional off-server shipping hook (`BACKUP_SYNC_COMMAND`)
- Backup root outside app directory (`/var/backups/todolist` by default)

WAL archive script for `archive_command`:

- `scripts/pg-wal-archive.sh`
- WAL archive directory defaults to `/var/backups/todolist/wal`

Example cron:

```cron
0 2 * * * cd /opt/todolist && DATABASE_URL='postgresql://app_user:app_password@127.0.0.1:5432/todolist?schema=public' ENABLE_PITR_BASE_BACKUP='true' BASE_BACKUP_DATABASE_URL='postgresql://replication_user:replication_password@127.0.0.1:5432/todolist?schema=public' BACKUP_ROOT='/var/backups/todolist' BACKUP_SYNC_COMMAND='rclone sync "$BACKUP_PATH" remote:todolist-db-backups' ./scripts/db-backup-nightly.sh >> /var/log/todolist-backup.log 2>&1
```

## 5. Restore Procedure (Disaster Recovery Drill)

Script: `scripts/db-restore-drill.sh`

Modes:

- Logical restore only: set `BACKUP_FILE`
- PITR only: set `PITR_TARGET_TIME` + `BASE_BACKUP_DIR` + `WAL_ARCHIVE_DIR`
- Combined drill: set both logical and PITR variables

### A) Full dump restore to clean database

```bash
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD='<password>'
export BACKUP_FILE='/var/backups/todolist/dumps/todolist_YYYYMMDDTHHMMSSZ.dump'
export RESTORE_DB='todolist_restore_drill'
./scripts/db-restore-drill.sh
```

What it does:

1. Drops and recreates `RESTORE_DB`
2. Restores dump with `pg_restore --clean --if-exists`
3. Runs sanity checks (`User`, `Team`, `TaskTemplate`, `DailyTask` existence/counts)

### B) PITR replay to target timestamp

```bash
export PITR_TARGET_TIME='2026-02-23 01:45:00+00'
export BASE_BACKUP_DIR='/var/backups/todolist/base/base_YYYYMMDDTHHMMSSZ'
export WAL_ARCHIVE_DIR='/var/backups/todolist/wal'
export PITR_PORT=55432
export PITR_PGDATA_DIR='/tmp/todolist-pitr-55432'
./scripts/db-restore-drill.sh
```

What it does:

1. Restores physical base backup to temp `PGDATA`
2. Creates `recovery.signal`
3. Replays WAL with `restore_command` until `recovery_target_time`
4. Starts temporary PostgreSQL instance on `PITR_PORT`
5. Runs sanity checks and stops temporary instance

## 6. Required Production Environment Variables

Required:

- `DATABASE_URL`
- `NODE_ENV` (`production`)
- `JWT_SECRET`
- `TRUST_PROXY`
- `COOKIE_SECURE`

Conditionally required:

- `CRON_SECRET` (required only if `/api/cron/daily-tasks` is used/enabled)

Recommended:

- `ALLOWED_ORIGINS`
- `PORT`
- `FRONTEND_URL`
- `BASE_BACKUP_DATABASE_URL` (required only when `ENABLE_PITR_BASE_BACKUP=true`)

## 7. Health Checks

Implemented endpoints:

- `GET /health/live` -> process up
- `GET /health/ready` -> process up + database query succeeds

Expected healthy responses:

```json
{ "status": "ok", "checks": { "server": "up" } }
```

```json
{ "status": "ok", "checks": { "server": "up", "database": "up" } }
```

## 8. Validation Checklist

### Fresh PostgreSQL migration test

```bash
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/todolist_validation?schema=public'
pnpm exec prisma migrate deploy
pnpm exec prisma migrate status
```

### Backup validity test

```bash
BACKUP_ROOT='/var/backups/todolist' DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/todolist_validation?schema=public' ENABLE_PITR_BASE_BACKUP='false' ./scripts/db-backup-nightly.sh
pg_restore --list /var/backups/todolist/dumps/todolist_*.dump | head
```

### Restore validity test

```bash
PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD='<password>' BACKUP_FILE='/var/backups/todolist/dumps/todolist_YYYYMMDDTHHMMSSZ.dump' RESTORE_DB='todolist_restore_drill' ./scripts/db-restore-drill.sh
```

### PITR validity test

```bash
PITR_TARGET_TIME='2026-02-23 01:45:00+00' BASE_BACKUP_DIR='/var/backups/todolist/base/base_YYYYMMDDTHHMMSSZ' WAL_ARCHIVE_DIR='/var/backups/todolist/wal' PITR_PORT=55432 PITR_PGDATA_DIR='/tmp/todolist-pitr-55432' ./scripts/db-restore-drill.sh
```

### App startup after restore

```bash
DATABASE_URL='postgresql://postgres:<password>@127.0.0.1:5432/todolist_restore_drill?schema=public' NODE_ENV=production JWT_SECRET='<secret>' TRUST_PROXY='true' COOKIE_SECURE='true' pnpm start
curl -fsS http://127.0.0.1:3000/health/live
curl -fsS http://127.0.0.1:3000/health/ready
```

### Automated CI drill

GitHub Actions job `backup-restore-drill` executes:

1. `prisma migrate deploy` on a fresh PostgreSQL database
2. backup generation with `scripts/db-backup-nightly.sh`
3. logical restore with `scripts/db-restore-drill.sh`
4. PITR restore drill with `scripts/db-restore-drill.sh` in PITR mode
5. production server startup against restored DB + `/health/live` and `/health/ready` checks
