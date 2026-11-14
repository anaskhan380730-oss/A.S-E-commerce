CREATE TABLE "AbandonedCheckout" (
    "id" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "customerName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "emailConsent" BOOLEAN NOT NULL DEFAULT false,
    "whatsappConsent" BOOLEAN NOT NULL DEFAULT false,
    "purchaseType" TEXT NOT NULL DEFAULT 'RETAIL',
    "items" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbandonedCheckout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AbandonedCheckout_sessionKey_key" ON "AbandonedCheckout"("sessionKey");
CREATE INDEX "AbandonedCheckout_status_updatedAt_idx" ON "AbandonedCheckout"("status", "updatedAt");
CREATE INDEX "AbandonedCheckout_expiresAt_idx" ON "AbandonedCheckout"("expiresAt");
