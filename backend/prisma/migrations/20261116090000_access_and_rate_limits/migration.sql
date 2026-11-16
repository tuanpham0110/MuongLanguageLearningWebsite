-- Additive migration: no learner/content rows are deleted or re-scored.
ALTER TABLE "User" ADD COLUMN "unlockedStages" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

-- Preserve access evidenced by progress/sessions/attempts, and stages that are
-- currently open under the original rule. A past unlock with no remaining
-- evidence cannot be reconstructed if earlier content was already changed.
UPDATE "User" u SET "unlockedStages" = ARRAY(
    SELECT s."id" FROM "Stage" s
    WHERE NOT EXISTS (
        SELECT 1 FROM "Stage" prev
        WHERE (prev."position", prev."id") < (s."position", s."id")
        AND (
            NOT EXISTS (SELECT 1 FROM "Lesson" l WHERE l."stageId" = prev."id" AND l."published")
            OR EXISTS (
                SELECT 1 FROM "Lesson" l
                WHERE l."stageId" = prev."id" AND l."published"
                AND NOT EXISTS (
                    SELECT 1 FROM "LessonProgress" p
                    WHERE p."userId" = u."id" AND p."lessonId" = l."id" AND p."passed"
                )
            )
        )
    ) OR EXISTS (
        SELECT 1 FROM "Lesson" l JOIN "Stage" reached ON reached."id" = l."stageId"
        WHERE (reached."position", reached."id") >= (s."position", s."id")
        AND (
            EXISTS (SELECT 1 FROM "LessonSession" ls WHERE ls."userId" = u."id" AND ls."lessonId" = l."id")
            OR EXISTS (SELECT 1 FROM "LessonProgress" p WHERE p."userId" = u."id" AND p."lessonId" = l."id" AND (p."passed" OR p."attempts" > 0))
            OR EXISTS (SELECT 1 FROM "Attempt" a WHERE a."userId" = u."id" AND a."lessonId" = l."id")
        )
    )
    ORDER BY s."position", s."id"
);

CREATE TABLE "RequestRateLimit" (
    "key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RequestRateLimit_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "RequestRateLimit_resetAt_idx" ON "RequestRateLimit"("resetAt");

-- Rollback application code first. Keep this column/table during rollback so
-- earned access is retained; the previous application ignores both additions.
