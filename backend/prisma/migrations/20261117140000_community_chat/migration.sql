CREATE TABLE "CommunityMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CommunityMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunityMessage_createdAt_id_idx" ON "CommunityMessage"("createdAt", "id");
CREATE INDEX "CommunityMessage_deletedAt_idx" ON "CommunityMessage"("deletedAt");
CREATE INDEX "CommunityMessage_userId_idx" ON "CommunityMessage"("userId");

ALTER TABLE "CommunityMessage" ADD CONSTRAINT "CommunityMessage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
