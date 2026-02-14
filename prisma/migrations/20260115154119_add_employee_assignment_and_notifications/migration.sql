-- RedefineTables
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
    "notifyEmployee" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskTemplate_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskTemplate_assignedToEmployeeId_fkey" FOREIGN KEY ("assignedToEmployeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaskTemplate" ("createdAt", "createdById", "description", "id", "isRecurring", "title", "updatedAt", "workstationId") SELECT "createdAt", "createdById", "description", "id", "isRecurring", "title", "updatedAt", "workstationId" FROM "TaskTemplate";
DROP TABLE "TaskTemplate";
ALTER TABLE "new_TaskTemplate" RENAME TO "TaskTemplate";
CREATE INDEX "TaskTemplate_workstationId_idx" ON "TaskTemplate"("workstationId");
CREATE INDEX "TaskTemplate_assignedToEmployeeId_idx" ON "TaskTemplate"("assignedToEmployeeId");
CREATE INDEX "TaskTemplate_createdById_idx" ON "TaskTemplate"("createdById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
