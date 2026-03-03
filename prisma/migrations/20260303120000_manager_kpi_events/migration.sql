-- Manager KPI events: track manager actions and timings for V2 dashboard.

-- CreateTable
CREATE TABLE "ManagerKpiEvent" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagerKpiEvent_pkey" PRIMARY KEY ("id")
);

-- Indexes to support common analytics queries (per manager, per event name, over time)
CREATE INDEX "ManagerKpiEvent_managerId_name_idx" ON "ManagerKpiEvent"("managerId", "name");
CREATE INDEX "ManagerKpiEvent_name_occurredAt_idx" ON "ManagerKpiEvent"("name", "occurredAt");

-- Foreign key: events are scoped to a manager user
ALTER TABLE "ManagerKpiEvent"
ADD CONSTRAINT "ManagerKpiEvent_managerId_fkey"
FOREIGN KEY ("managerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

