BEGIN;
ALTER TABLE "SupportMessage" ADD COLUMN "senderId" TEXT, ADD COLUMN "clientMessageId" TEXT;
CREATE UNIQUE INDEX "SupportMessage_senderId_clientMessageId_key" ON "SupportMessage"("senderId", "clientMessageId");

ALTER TABLE "CommunityMessage" ADD COLUMN "clientMessageId" TEXT, ADD COLUMN "position" INTEGER;
WITH ordered AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt", "id")::INTEGER AS n FROM "CommunityMessage"
)
UPDATE "CommunityMessage" AS message SET "position" = ordered.n FROM ordered WHERE ordered."id" = message."id";

CREATE SEQUENCE "CommunityMessage_position_seq" OWNED BY "CommunityMessage"."position";
SELECT setval('"CommunityMessage_position_seq"', COALESCE(MAX("position"), 0) + 1, false) FROM "CommunityMessage";
ALTER TABLE "CommunityMessage" ALTER COLUMN "position" SET DEFAULT nextval('"CommunityMessage_position_seq"'),
    ALTER COLUMN "position" SET NOT NULL;
CREATE UNIQUE INDEX "CommunityMessage_position_key" ON "CommunityMessage"("position");
CREATE UNIQUE INDEX "CommunityMessage_userId_clientMessageId_key" ON "CommunityMessage"("userId", "clientMessageId");
CREATE INDEX "CommunityMessage_deletedAt_position_idx" ON "CommunityMessage"("deletedAt", "position");

ALTER TABLE "User" ADD COLUMN "communityReadPosition" INTEGER NOT NULL DEFAULT 0;
UPDATE "User" AS reader SET "communityReadPosition" = COALESCE((
    SELECT MAX(message."position") FROM "CommunityMessage" AS message
    WHERE message."createdAt" < reader."communityReadAt"
       OR (message."createdAt" = reader."communityReadAt" AND message."id" <= COALESCE(reader."communityReadId", ''))
), 0) WHERE reader."communityReadAt" IS NOT NULL;

-- A sequence alone can be allocated before an earlier INSERT commits. Allocate the
-- final position after taking the transaction lock; release it only at commit.
-- Defaults may consume unused numbers while waiting. Gaps are intentional and safe.
CREATE FUNCTION "assign_community_message_position"() RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(1297435714);
    NEW."position" := nextval(pg_get_serial_sequence(format('%I.%I', TG_TABLE_SCHEMA, TG_TABLE_NAME), 'position'));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CommunityMessage_assign_position" BEFORE INSERT ON "CommunityMessage"
    FOR EACH ROW EXECUTE FUNCTION "assign_community_message_position"();
COMMIT;
