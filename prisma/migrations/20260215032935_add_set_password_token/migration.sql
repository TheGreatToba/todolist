-- CreateTable
CREATE TABLE "SetPasswordToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "SetPasswordToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SetPasswordToken_userId_key" ON "SetPasswordToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SetPasswordToken_token_key" ON "SetPasswordToken"("token");

-- CreateIndex
CREATE INDEX "SetPasswordToken_token_idx" ON "SetPasswordToken"("token");

-- CreateIndex
CREATE INDEX "SetPasswordToken_expiresAt_idx" ON "SetPasswordToken"("expiresAt");
