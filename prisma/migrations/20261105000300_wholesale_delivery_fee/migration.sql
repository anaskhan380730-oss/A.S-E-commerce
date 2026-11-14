ALTER TABLE "StoreSettings"
ADD COLUMN "wholesaleDeliveryFee" INTEGER NOT NULL DEFAULT 850;

UPDATE "StoreSettings"
SET "wholesaleDeliveryFee" = 850
WHERE "id" = 'store';
