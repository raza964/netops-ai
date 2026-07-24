-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CommandStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "TroubleshootingStep" ADD COLUMN     "commandCatalogEntryId" TEXT;

-- CreateTable
CREATE TABLE "CommandCatalogEntry" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "commandText" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "purpose" TEXT,
    "expectedOutput" TEXT,
    "vendorId" TEXT NOT NULL,
    "deviceTypeId" TEXT,
    "technologyId" TEXT,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "isConfigChange" BOOLEAN NOT NULL DEFAULT false,
    "status" "CommandStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommandCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommandCatalogEntry_slug_key" ON "CommandCatalogEntry"("slug");

-- CreateIndex
CREATE INDEX "CommandCatalogEntry_status_idx" ON "CommandCatalogEntry"("status");

-- CreateIndex
CREATE INDEX "CommandCatalogEntry_vendorId_idx" ON "CommandCatalogEntry"("vendorId");

-- CreateIndex
CREATE INDEX "CommandCatalogEntry_deviceTypeId_idx" ON "CommandCatalogEntry"("deviceTypeId");

-- CreateIndex
CREATE INDEX "CommandCatalogEntry_technologyId_idx" ON "CommandCatalogEntry"("technologyId");

-- CreateIndex
CREATE INDEX "CommandCatalogEntry_riskLevel_idx" ON "CommandCatalogEntry"("riskLevel");

-- CreateIndex
CREATE INDEX "CommandCatalogEntry_deletedAt_idx" ON "CommandCatalogEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "CommandCatalogEntry_vendorId_deviceTypeId_idx" ON "CommandCatalogEntry"("vendorId", "deviceTypeId");

-- CreateIndex
CREATE INDEX "TroubleshootingStep_commandCatalogEntryId_idx" ON "TroubleshootingStep"("commandCatalogEntryId");

-- AddForeignKey
ALTER TABLE "TroubleshootingStep" ADD CONSTRAINT "TroubleshootingStep_commandCatalogEntryId_fkey" FOREIGN KEY ("commandCatalogEntryId") REFERENCES "CommandCatalogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandCatalogEntry" ADD CONSTRAINT "CommandCatalogEntry_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandCatalogEntry" ADD CONSTRAINT "CommandCatalogEntry_deviceTypeId_fkey" FOREIGN KEY ("deviceTypeId") REFERENCES "DeviceType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandCatalogEntry" ADD CONSTRAINT "CommandCatalogEntry_technologyId_fkey" FOREIGN KEY ("technologyId") REFERENCES "Technology"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandCatalogEntry" ADD CONSTRAINT "CommandCatalogEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommandCatalogEntry" ADD CONSTRAINT "CommandCatalogEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
