ALTER TABLE "User" ADD COLUMN "communityReadAt" TIMESTAMP(3),
    ADD COLUMN "communityReadId" TEXT;

CREATE INDEX "CommunityMessage_deletedAt_createdAt_id_idx"
    ON "CommunityMessage"("deletedAt", "createdAt", "id");
