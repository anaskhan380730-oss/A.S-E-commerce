ALTER TABLE "StoreSettings"
    ADD COLUMN "shippingPolicy" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "returnsPolicy" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "privacyPolicy" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "termsPolicy" TEXT NOT NULL DEFAULT '';
