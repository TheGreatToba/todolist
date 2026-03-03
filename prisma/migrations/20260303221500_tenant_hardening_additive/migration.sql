-- Tenant hardening (additive only):
-- - Prepare RLS compatibility with Team.tenantKey
-- - Ensure critical indexes for logical multi-tenant scoping
-- - Ensure core FK constraints exist with coherent delete behavior

ALTER TABLE "Team"
ADD COLUMN IF NOT EXISTS "tenantKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Team_tenantKey_key"
ON "Team"("tenantKey");

-- Defensive index creation (idempotent)
CREATE INDEX IF NOT EXISTS "User_teamId_idx" ON "User"("teamId");
CREATE INDEX IF NOT EXISTS "Team_managerId_idx" ON "Team"("managerId");
CREATE INDEX IF NOT EXISTS "Workstation_teamId_idx" ON "Workstation"("teamId");
CREATE INDEX IF NOT EXISTS "DailyTask_employeeId_idx" ON "DailyTask"("employeeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Team_managerId_fkey'
      AND conrelid = '"Team"'::regclass
  ) THEN
    ALTER TABLE "Team"
    ADD CONSTRAINT "Team_managerId_fkey"
    FOREIGN KEY ("managerId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_teamId_fkey'
      AND conrelid = '"User"'::regclass
  ) THEN
    ALTER TABLE "User"
    ADD CONSTRAINT "User_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Workstation_teamId_fkey'
      AND conrelid = '"Workstation"'::regclass
  ) THEN
    ALTER TABLE "Workstation"
    ADD CONSTRAINT "Workstation_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'DailyTask_employeeId_fkey'
      AND conrelid = '"DailyTask"'::regclass
  ) THEN
    ALTER TABLE "DailyTask"
    ADD CONSTRAINT "DailyTask_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
