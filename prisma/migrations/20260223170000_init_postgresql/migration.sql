-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workstation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workstation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeWorkstation" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workstationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeWorkstation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTemplate" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetPasswordToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetPasswordToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL,
    "taskTemplateId" TEXT,
    "templateSourceId" TEXT NOT NULL DEFAULT '',
    "templateTitle" TEXT NOT NULL DEFAULT '',
    "templateDescription" TEXT,
    "templateRecurrenceType" TEXT,
    "templateIsRecurring" BOOLEAN NOT NULL DEFAULT true,
    "templateWorkstationId" TEXT,
    "templateWorkstationName" TEXT,
    "employeeId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayPreparation" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "preparedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayPreparation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Team_managerId_idx" ON "Team"("managerId");

-- CreateIndex
CREATE INDEX "Workstation_teamId_idx" ON "Workstation"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Workstation_teamId_name_key" ON "Workstation"("teamId", "name");

-- CreateIndex
CREATE INDEX "EmployeeWorkstation_employeeId_idx" ON "EmployeeWorkstation"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeWorkstation_workstationId_idx" ON "EmployeeWorkstation"("workstationId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeWorkstation_employeeId_workstationId_key" ON "EmployeeWorkstation"("employeeId", "workstationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_teamId_idx" ON "User"("teamId");

-- CreateIndex
CREATE INDEX "TaskTemplate_workstationId_idx" ON "TaskTemplate"("workstationId");

-- CreateIndex
CREATE INDEX "TaskTemplate_assignedToEmployeeId_idx" ON "TaskTemplate"("assignedToEmployeeId");

-- CreateIndex
CREATE INDEX "TaskTemplate_createdById_idx" ON "TaskTemplate"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "SetPasswordToken_userId_key" ON "SetPasswordToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SetPasswordToken_tokenHash_key" ON "SetPasswordToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SetPasswordToken_tokenHash_idx" ON "SetPasswordToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SetPasswordToken_expiresAt_idx" ON "SetPasswordToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tokenHash_idx" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE INDEX "DailyTask_employeeId_idx" ON "DailyTask"("employeeId");

-- CreateIndex
CREATE INDEX "DailyTask_taskTemplateId_idx" ON "DailyTask"("taskTemplateId");

-- CreateIndex
CREATE INDEX "DailyTask_templateSourceId_employeeId_date_idx" ON "DailyTask"("templateSourceId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "DailyTask_templateWorkstationId_idx" ON "DailyTask"("templateWorkstationId");

-- CreateIndex
CREATE INDEX "DailyTask_date_idx" ON "DailyTask"("date");

-- CreateIndex
CREATE INDEX "DailyTask_status_idx" ON "DailyTask"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_taskTemplateId_employeeId_date_key" ON "DailyTask"("taskTemplateId", "employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_historical_templateSource_employee_date_unique" ON "DailyTask"("templateSourceId", "employeeId", "date") WHERE "taskTemplateId" IS NULL AND "templateSourceId" <> '' AND "employeeId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "DayPreparation_date_idx" ON "DayPreparation"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DayPreparation_managerId_date_key" ON "DayPreparation"("managerId", "date");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workstation" ADD CONSTRAINT "Workstation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkstation" ADD CONSTRAINT "EmployeeWorkstation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeWorkstation" ADD CONSTRAINT "EmployeeWorkstation_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_workstationId_fkey" FOREIGN KEY ("workstationId") REFERENCES "Workstation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_assignedToEmployeeId_fkey" FOREIGN KEY ("assignedToEmployeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTemplate" ADD CONSTRAINT "TaskTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetPasswordToken" ADD CONSTRAINT "SetPasswordToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_taskTemplateId_fkey" FOREIGN KEY ("taskTemplateId") REFERENCES "TaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayPreparation" ADD CONSTRAINT "DayPreparation_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

