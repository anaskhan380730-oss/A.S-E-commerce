CREATE TABLE "StoreReel" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT,
    "localFileName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreReel_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoreReel_active_sortOrder_idx" ON "StoreReel"("active", "sortOrder");

ALTER TABLE "StoreReel"
ADD CONSTRAINT "StoreReel_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
