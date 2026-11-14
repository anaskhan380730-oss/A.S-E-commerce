ALTER TABLE "StoreSettings"
ADD COLUMN "internationalShippingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "internationalDeliveryFeeUsdCents" INTEGER,
ADD COLUMN "internationalCountries" TEXT NOT NULL DEFAULT '',
ADD COLUMN "internationalDeliveryDays" TEXT NOT NULL DEFAULT '12–15 days';
