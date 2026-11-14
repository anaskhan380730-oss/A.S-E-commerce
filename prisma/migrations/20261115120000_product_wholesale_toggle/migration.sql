ALTER TABLE "Product"
ADD COLUMN "wholesaleEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Preserve wholesale for the product groups currently intended for bulk orders.
-- New and unrelated existing products remain wholesale-off until enabled in admin.
UPDATE "Product" AS product
SET "wholesaleEnabled" = true
FROM "Category" AS category
WHERE product."categoryId" = category.id
  AND (
    product.name ILIKE '%trouser%' OR category.name ILIKE '%trouser%'
    OR product.name ILIKE '%shalwar%' OR category.name ILIKE '%shalwar%'
    OR product.name ILIKE '%flapper%' OR category.name ILIKE '%flapper%'
    OR product.name ILIKE '%freshi%' OR category.name ILIKE '%freshi%'
  );
