-- Recurrence Engine V2: add explicit recurrence mode and after-completion fields.
-- Backward compatibility: existing templates default to schedule_based.
ALTER TABLE "TaskTemplate"
ADD COLUMN "recurrenceMode" TEXT NOT NULL DEFAULT 'schedule_based',
ADD COLUMN "recurrenceDayOfMonth" INTEGER,
ADD COLUMN "recurrenceInterval" INTEGER,
ADD COLUMN "recurrenceIntervalUnit" TEXT;

-- Legacy templates (daily/weekly/x_per_week) are mapped to schedule_based.
UPDATE "TaskTemplate"
SET "recurrenceMode" = 'schedule_based'
WHERE "recurrenceMode" IS NULL OR "recurrenceMode" = '';

ALTER TABLE "TaskTemplate"
ADD CONSTRAINT "TaskTemplate_recurrenceMode_check"
CHECK ("recurrenceMode" IN ('schedule_based', 'after_completion', 'manual_trigger'));

ALTER TABLE "TaskTemplate"
ADD CONSTRAINT "TaskTemplate_recurrenceDayOfMonth_check"
CHECK (
  "recurrenceDayOfMonth" IS NULL
  OR ("recurrenceDayOfMonth" >= 1 AND "recurrenceDayOfMonth" <= 31)
);

ALTER TABLE "TaskTemplate"
ADD CONSTRAINT "TaskTemplate_recurrenceInterval_check"
CHECK ("recurrenceInterval" IS NULL OR "recurrenceInterval" > 0);

ALTER TABLE "TaskTemplate"
ADD CONSTRAINT "TaskTemplate_recurrenceIntervalUnit_check"
CHECK (
  "recurrenceIntervalUnit" IS NULL
  OR "recurrenceIntervalUnit" IN ('day', 'week', 'month')
);

CREATE INDEX "TaskTemplate_recurrenceMode_idx" ON "TaskTemplate"("recurrenceMode");

-- Enforce idempotency for auto-generated unassigned occurrences.
-- Non-destructive approach: keep historical duplicate rows but mark extra rows as SUPERSEDED.
WITH ranked_unassigned AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "taskTemplateId", "date"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "DailyTask"
  WHERE
    "taskTemplateId" IS NOT NULL
    AND "employeeId" IS NULL
    AND "status" = 'UNASSIGNED'
)
UPDATE "DailyTask" d
SET
  "status" = 'SUPERSEDED',
  "isCompleted" = true,
  "completedAt" = COALESCE(d."completedAt", d."createdAt")
FROM ranked_unassigned r
WHERE d."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX "DailyTask_unassigned_template_date_unique"
ON "DailyTask" ("taskTemplateId", "date")
WHERE
  "taskTemplateId" IS NOT NULL
  AND "employeeId" IS NULL
  AND "status" = 'UNASSIGNED';
