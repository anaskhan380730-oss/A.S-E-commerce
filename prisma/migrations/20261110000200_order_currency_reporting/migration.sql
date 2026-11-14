ALTER TABLE "Order"
ADD COLUMN "country" TEXT NOT NULL DEFAULT 'Pakistan',
ADD COLUMN "orderCurrency" TEXT NOT NULL DEFAULT 'PKR',
ADD COLUMN "orderCurrencyRate" DECIMAL(10,2) NOT NULL DEFAULT 280.00,
ADD COLUMN "orderCurrencySubtotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "orderCurrencyShipping" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "orderCurrencyDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "orderCurrencyTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "paidCurrency" TEXT,
ADD COLUMN "paidAmountMinor" INTEGER;

UPDATE "Order"
SET "orderCurrencySubtotal" = "subtotal",
    "orderCurrencyShipping" = "shipping",
    "orderCurrencyDiscount" = "discount",
    "orderCurrencyTotal" = "total"
WHERE "orderCurrency" = 'PKR';

UPDATE "Order"
SET "paidCurrency" = 'PKR',
    "paidAmountMinor" = "total"
WHERE "paymentStatus" = 'PAID';

CREATE INDEX "Order_country_city_orderCurrency_idx"
ON "Order"("country", "city", "orderCurrency");

CREATE INDEX "Order_paidCurrency_paymentStatus_idx"
ON "Order"("paidCurrency", "paymentStatus");
