ALTER TABLE "Order" ADD COLUMN "customerId" TEXT;

ALTER TABLE "AbandonedCheckout"
  ADD COLUMN "address" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "country" TEXT;

CREATE TABLE "Customer" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "address" TEXT,
  "city" TEXT,
  "country" TEXT,
  "passwordHash" TEXT NOT NULL,
  "passwordVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerPasswordResetToken" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerAuthRateLimit" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerAuthRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE UNIQUE INDEX "CustomerPasswordResetToken_tokenHash_key" ON "CustomerPasswordResetToken"("tokenHash");
CREATE INDEX "CustomerPasswordResetToken_customerId_expiresAt_idx" ON "CustomerPasswordResetToken"("customerId", "expiresAt");
CREATE INDEX "CustomerPasswordResetToken_expiresAt_idx" ON "CustomerPasswordResetToken"("expiresAt");
CREATE INDEX "CustomerAuthRateLimit_expiresAt_idx" ON "CustomerAuthRateLimit"("expiresAt");
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");

ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerPasswordResetToken" ADD CONSTRAINT "CustomerPasswordResetToken_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
