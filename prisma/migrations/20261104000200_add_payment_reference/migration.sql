ALTER TABLE "Order" ADD COLUMN "providerReference" TEXT;

CREATE UNIQUE INDEX "Order_providerReference_key" ON "Order"("providerReference");
