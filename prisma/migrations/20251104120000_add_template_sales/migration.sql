-- Add Stripe product reference to plans
ALTER TABLE "Plan" ADD COLUMN "productId" TEXT NOT NULL DEFAULT 'legacy_product';
ALTER TABLE "Plan" ALTER COLUMN "productId" DROP DEFAULT;

-- Template sales support
CREATE TYPE "TemplateSaleStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED');

CREATE TABLE "TemplateSale" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "package" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "TemplateSaleStatus" NOT NULL DEFAULT 'PENDING',
    "paymentIntentId" TEXT,
    "companyName" TEXT,
    "useCase" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "customerDetails" JSONB,
    CONSTRAINT "TemplateSale_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TemplateSale_sessionId_key" UNIQUE ("sessionId")
);

CREATE INDEX "TemplateSale_email_idx" ON "TemplateSale" ("email");
CREATE INDEX "TemplateSale_status_idx" ON "TemplateSale" ("status");
CREATE INDEX "TemplateSale_createdAt_idx" ON "TemplateSale" ("createdAt");

CREATE TABLE "TemplateSaleCustomer" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "package" TEXT NOT NULL,
    "licenseKey" TEXT NOT NULL,
    "downloadToken" TEXT NOT NULL,
    "githubTeamId" TEXT,
    "supportTier" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    CONSTRAINT "TemplateSaleCustomer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TemplateSaleCustomer_saleId_key" UNIQUE ("saleId"),
    CONSTRAINT "TemplateSaleCustomer_licenseKey_key" UNIQUE ("licenseKey"),
    CONSTRAINT "TemplateSaleCustomer_downloadToken_key" UNIQUE ("downloadToken"),
    CONSTRAINT "TemplateSaleCustomer_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "TemplateSale" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TemplateSaleCustomer_email_idx" ON "TemplateSaleCustomer" ("email");
CREATE INDEX "TemplateSaleCustomer_package_idx" ON "TemplateSaleCustomer" ("package");
CREATE INDEX "TemplateSaleCustomer_supportTier_idx" ON "TemplateSaleCustomer" ("supportTier");

CREATE TABLE "StripeWebhookEvent" (
    "eventId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("eventId")
);
