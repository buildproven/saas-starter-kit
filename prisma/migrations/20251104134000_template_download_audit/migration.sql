-- CreateEnum
CREATE TYPE "DownloadStatus" AS ENUM ('SUCCESS', 'RATE_LIMIT', 'INVALID_TOKEN', 'EXPIRED', 'BLOCKED', 'ERROR');

-- CreateTable
CREATE TABLE "TemplateDownloadAudit" (
    "id" TEXT NOT NULL,
    "saleId" TEXT,
    "customerId" TEXT,
    "downloadToken" TEXT NOT NULL,
    "package" TEXT,
    "format" TEXT NOT NULL,
    "status" "DownloadStatus" NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateDownloadAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplateDownloadAudit_downloadToken_idx" ON "TemplateDownloadAudit"("downloadToken");

-- CreateIndex
CREATE INDEX "TemplateDownloadAudit_createdAt_idx" ON "TemplateDownloadAudit"("createdAt");

-- CreateIndex
CREATE INDEX "TemplateDownloadAudit_saleId_idx" ON "TemplateDownloadAudit"("saleId");
