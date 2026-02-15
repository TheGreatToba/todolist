-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workstation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workstation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Workstation" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Workstation";
DROP TABLE "Workstation";
ALTER TABLE "new_Workstation" RENAME TO "Workstation";
CREATE INDEX "Workstation_teamId_idx" ON "Workstation"("teamId");
CREATE UNIQUE INDEX "Workstation_teamId_name_key" ON "Workstation"("teamId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
