-- Store settings for delayed confirmations and feedback requests
ALTER TABLE "StoreSettings" ADD COLUMN     "confirmationDelayHours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "feedbackAfterMonths" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "feedbackMessage" TEXT NOT NULL DEFAULT 'Assalam o Alaikum {name}! It has been a while since your last order from {store}. We would love your feedback on our products and service. Please reply to this message and share your thoughts.';

-- Keep existing abandoned-checkout rows: rename the table to Suspect
ALTER TABLE "AbandonedCheckout" RENAME TO "Suspect";
ALTER TABLE "Suspect" RENAME CONSTRAINT "AbandonedCheckout_pkey" TO "Suspect_pkey";
ALTER INDEX "AbandonedCheckout_sessionKey_key" RENAME TO "Suspect_sessionKey_key";
ALTER INDEX "AbandonedCheckout_status_updatedAt_idx" RENAME TO "Suspect_status_updatedAt_idx";
ALTER INDEX "AbandonedCheckout_expiresAt_idx" RENAME TO "Suspect_expiresAt_idx";
ALTER TABLE "Suspect" ADD COLUMN "lastStep" TEXT,
ADD COLUMN "orderId" TEXT,
ADD COLUMN "convertedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Suspect_orderId_key" ON "Suspect"("orderId");

-- CreateTable
CREATE TABLE "CanceledOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "canceledBy" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "followUpStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanceledOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanceledOrder_orderId_key" ON "CanceledOrder"("orderId");

-- CreateIndex
CREATE INDEX "CanceledOrder_followUpStatus_createdAt_idx" ON "CanceledOrder"("followUpStatus", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationLog_kind_createdAt_idx" ON "NotificationLog"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_kind_channel_referenceId_key" ON "NotificationLog"("kind", "channel", "referenceId");

-- AddForeignKey
ALTER TABLE "CanceledOrder" ADD CONSTRAINT "CanceledOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
