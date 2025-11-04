-- AlterTable
ALTER TABLE "TemplateSale"
ADD COLUMN     "githubUsername" TEXT;

-- AlterTable
ALTER TABLE "TemplateSaleCustomer"
ADD COLUMN     "githubUsername" TEXT;

-- CreateIndex
CREATE INDEX "TemplateSale_githubUsername_idx" ON "TemplateSale"("githubUsername");

-- CreateIndex
CREATE INDEX "TemplateSaleCustomer_githubUsername_idx" ON "TemplateSaleCustomer"("githubUsername");
