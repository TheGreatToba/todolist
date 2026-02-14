-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workstation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EmployeeWorkstation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "workstationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeWorkstation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmployeeWorkstation_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "teamId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "workstationId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaskTemplate_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskTemplateId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DailyTask_taskTemplateId_fkey" FOREIGN KEY ("taskTemplateId") REFERENCES "TaskTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DailyTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Team_managerId_idx" ON "Team"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Workstation_name_key" ON "Workstation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeWorkstation_employeeId_workstationId_key" ON "EmployeeWorkstation"("employeeId", "workstationId");

-- CreateIndex
CREATE INDEX "EmployeeWorkstation_employeeId_idx" ON "EmployeeWorkstation"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeWorkstation_workstationId_idx" ON "EmployeeWorkstation"("workstationId");

-- CreateIndex
CREATE INDEX "TaskTemplate_workstationId_idx" ON "TaskTemplate"("workstationId");

-- CreateIndex
CREATE INDEX "TaskTemplate_createdById_idx" ON "TaskTemplate"("createdById");

-- CreateIndex
CREATE INDEX "DailyTask_employeeId_idx" ON "DailyTask"("employeeId");

-- CreateIndex
CREATE INDEX "DailyTask_taskTemplateId_idx" ON "DailyTask"("taskTemplateId");

-- CreateIndex
CREATE INDEX "DailyTask_date_idx" ON "DailyTask"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_taskTemplateId_employeeId_date_key" ON "DailyTask"("taskTemplateId", "employeeId", "date");
