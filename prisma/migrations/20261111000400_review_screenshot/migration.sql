ALTER TABLE "Review"
    ADD COLUMN "screenshotConsent" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "screenshotUrl" TEXT,
    ADD COLUMN "screenshotCloudinaryPublicId" TEXT,
    ADD COLUMN "screenshotLocalFileName" TEXT;
