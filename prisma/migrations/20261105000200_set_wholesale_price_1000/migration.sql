ALTER TABLE "StoreSettings"
ALTER COLUMN "wholesalePrice" SET DEFAULT 1000;

UPDATE "StoreSettings"
SET "wholesalePrice" = 1000
WHERE "id" = 'store';
