-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('COMMAND', 'NOTE', 'AI_ANALYSIS', 'NEXT_STEP_RECOMMENDATION', 'STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "ApprovalState" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "TroubleshootingCase" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "deviceTypeId" TEXT NOT NULL,
    "technologyId" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "rootCause" TEXT,
    "resolution" TEXT,
    "verification" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TroubleshootingCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TroubleshootingStep" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "StepType" NOT NULL,
    "commandText" TEXT,
    "commandOutput" TEXT,
    "isConfigChange" BOOLEAN NOT NULL DEFAULT false,
    "approvalState" "ApprovalState" NOT NULL DEFAULT 'NOT_REQUIRED',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "note" TEXT,
    "aiAnalysis" TEXT,
    "recommendedNextStep" TEXT,
    "aiModel" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TroubleshootingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TroubleshootingCase_status_idx" ON "TroubleshootingCase"("status");

-- CreateIndex
CREATE INDEX "TroubleshootingCase_vendorId_idx" ON "TroubleshootingCase"("vendorId");

-- CreateIndex
CREATE INDEX "TroubleshootingCase_deletedAt_idx" ON "TroubleshootingCase"("deletedAt");

-- CreateIndex
CREATE INDEX "TroubleshootingStep_caseId_idx" ON "TroubleshootingStep"("caseId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- AddForeignKey
ALTER TABLE "TroubleshootingCase" ADD CONSTRAINT "TroubleshootingCase_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TroubleshootingCase" ADD CONSTRAINT "TroubleshootingCase_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TroubleshootingCase" ADD CONSTRAINT "TroubleshootingCase_technologyId_fkey" FOREIGN KEY ("technologyId") REFERENCES "Technology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TroubleshootingCase" ADD CONSTRAINT "TroubleshootingCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TroubleshootingStep" ADD CONSTRAINT "TroubleshootingStep_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "TroubleshootingCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TroubleshootingStep" ADD CONSTRAINT "TroubleshootingStep_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TroubleshootingStep" ADD CONSTRAINT "TroubleshootingStep_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
