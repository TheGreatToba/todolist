-- Redefine TaskTemplate to add recurrence fields
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_TaskTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "workstationId" TEXT,
    "assignedToEmployeeId" TEXT,
    "createdById" TEXT NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "recurrenceType" TEXT NOT NULL DEFAULT 'daily',
    "recurrenceDays" TEXT,
    "targetPerWeek" INTEGER,
    "notifyEmployee" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskTemplate_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskTemplate_assignedToEmployeeId_fkey" FOREIGN KEY ("assignedToEmployeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_TaskTemplate" (
  "id",
  "title",
  "description",
  "workstationId",
  "assignedToEmployeeId",
  "createdById",
  "isRecurring",
  "notifyEmployee",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "title",
  "description",
  "workstationId",
  "assignedToEmployeeId",
  "createdById",
  "isRecurring",
  "notifyEmployee",
  "createdAt",
  "updatedAt"
FROM "TaskTemplate";

DROP TABLE "TaskTemplate";
ALTER TABLE "new_TaskTemplate" RENAME TO "TaskTemplate";

CREATE INDEX "TaskTemplate_workstationId_idx" ON "TaskTemplate"("workstationId");
CREATE INDEX "TaskTemplate_assignedToEmployeeId_idx" ON "TaskTemplate"("assignedToEmployeeId");
CREATE INDEX "TaskTemplate_createdById_idx" ON "TaskTemplate"("createdById");

-- Redefine DailyTask to make employee optional and persist explicit status
CREATE TABLE "new_DailyTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskTemplateId" TEXT NOT NULL,
    "employeeId" TEXT,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyTask_taskTemplateId_fkey" FOREIGN KEY ("taskTemplateId") REFERENCES "TaskTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_DailyTask" (
  "id",
  "taskTemplateId",
  "employeeId",
  "date",
  "status",
  "isCompleted",
  "completedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "taskTemplateId",
  "employeeId",
  "date",
  CASE
    WHEN "isCompleted" = 1 THEN 'DONE'
    ELSE 'ASSIGNED'
  END,
  "isCompleted",
  "completedAt",
  "createdAt",
  "updatedAt"
FROM "DailyTask";

DROP TABLE "DailyTask";
ALTER TABLE "new_DailyTask" RENAME TO "DailyTask";

CREATE UNIQUE INDEX "DailyTask_taskTemplateId_employeeId_date_key" ON "DailyTask"("taskTemplateId", "employeeId", "date");
CREATE INDEX "DailyTask_employeeId_idx" ON "DailyTask"("employeeId");
CREATE INDEX "DailyTask_taskTemplateId_idx" ON "DailyTask"("taskTemplateId");
CREATE INDEX "DailyTask_date_idx" ON "DailyTask"("date");
CREATE INDEX "DailyTask_status_idx" ON "DailyTask"("status");

-- Persist per-manager day preparation state
CREATE TABLE "DayPreparation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "managerId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "preparedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DayPreparation_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DayPreparation_managerId_date_key" ON "DayPreparation"("managerId", "date");
CREATE INDEX "DayPreparation_date_idx" ON "DayPreparation"("date");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
