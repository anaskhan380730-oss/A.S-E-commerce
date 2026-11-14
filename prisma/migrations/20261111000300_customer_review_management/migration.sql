ALTER TABLE "Review"
    ALTER COLUMN "productId" DROP NOT NULL,
    ADD COLUMN "orderId" TEXT,
    ADD COLUMN "source" TEXT NOT NULL DEFAULT 'WHATSAPP',
    ADD COLUMN "customerConsent" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "verifiedPurchase" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Review_approved_createdAt_idx" ON "Review"("approved", "createdAt");
CREATE INDEX "Review_orderId_idx" ON "Review"("orderId");

ALTER TABLE "Review"
ADD CONSTRAINT "Review_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
