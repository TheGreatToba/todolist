-- Incremental production-safe migration for DailyTask historical snapshots.
-- Supports existing PostgreSQL databases that predate snapshot columns/FK behavior.

-- Make template link optional for preserved history rows.
ALTER TABLE "DailyTask"
ALTER COLUMN "taskTemplateId" DROP NOT NULL;

-- Add immutable snapshot columns when missing.
ALTER TABLE "DailyTask"
ADD COLUMN IF NOT EXISTS "templateSourceId" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "templateTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS "templateDescription" TEXT,
ADD COLUMN IF NOT EXISTS "templateRecurrenceType" TEXT,
ADD COLUMN IF NOT EXISTS "templateIsRecurring" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "templateWorkstationId" TEXT,
ADD COLUMN IF NOT EXISTS "templateWorkstationName" TEXT;

-- Normalize legacy nullable values before enforcing not-null defaults.
UPDATE "DailyTask" SET "templateSourceId" = '' WHERE "templateSourceId" IS NULL;
UPDATE "DailyTask" SET "templateTitle" = '' WHERE "templateTitle" IS NULL;
UPDATE "DailyTask" SET "templateIsRecurring" = true WHERE "templateIsRecurring" IS NULL;

ALTER TABLE "DailyTask"
ALTER COLUMN "templateSourceId" SET DEFAULT '',
ALTER COLUMN "templateSourceId" SET NOT NULL,
ALTER COLUMN "templateTitle" SET DEFAULT '',
ALTER COLUMN "templateTitle" SET NOT NULL,
ALTER COLUMN "templateIsRecurring" SET DEFAULT true,
ALTER COLUMN "templateIsRecurring" SET NOT NULL;

-- Backfill immutable snapshot payload for existing rows linked to a template
-- when snapshot core fields are missing.
UPDATE "DailyTask" AS dt
SET
  "templateSourceId" = tt."id",
  "templateTitle" = tt."title",
  "templateDescription" = tt."description",
  "templateRecurrenceType" = tt."recurrenceType",
  "templateIsRecurring" = tt."isRecurring",
  "templateWorkstationId" = ws."id",
  "templateWorkstationName" = ws."name"
FROM "TaskTemplate" AS tt
LEFT JOIN "Workstation" AS ws
  ON ws."id" = tt."workstationId"
WHERE
  dt."taskTemplateId" = tt."id"
  AND (
    NULLIF(BTRIM(dt."templateSourceId"), '') IS NULL
    OR NULLIF(BTRIM(dt."templateTitle"), '') IS NULL
    OR dt."templateRecurrenceType" IS NULL
  );

-- Enforce history-preserving deletion behavior.
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT conname
    FROM pg_constraint
    WHERE
      contype = 'f'
      AND conrelid = '"DailyTask"'::regclass
      AND confrelid = '"TaskTemplate"'::regclass
  LOOP
    EXECUTE format('ALTER TABLE "DailyTask" DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;

ALTER TABLE "DailyTask"
ADD CONSTRAINT "DailyTask_taskTemplateId_fkey"
FOREIGN KEY ("taskTemplateId") REFERENCES "TaskTemplate"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Ensure indexes required by fallback/history access patterns.
CREATE INDEX IF NOT EXISTS "DailyTask_taskTemplateId_idx" ON "DailyTask"("taskTemplateId");
CREATE INDEX IF NOT EXISTS "DailyTask_templateSourceId_employeeId_date_idx" ON "DailyTask"("templateSourceId", "employeeId", "date");
CREATE INDEX IF NOT EXISTS "DailyTask_templateWorkstationId_idx" ON "DailyTask"("templateWorkstationId");

-- Historical uniqueness for rows detached from deleted templates.
-- If this fails due to pre-existing duplicates, run:
--   pnpm audit:historical-task-conflicts
-- then resolve duplicates before re-running migration.
CREATE UNIQUE INDEX IF NOT EXISTS "DailyTask_historical_templateSource_employee_date_unique"
ON "DailyTask"("templateSourceId", "employeeId", "date")
WHERE
  "taskTemplateId" IS NULL
  AND "templateSourceId" <> ''
  AND "employeeId" IS NOT NULL;
