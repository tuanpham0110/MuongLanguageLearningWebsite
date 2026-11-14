-- Content management: language-data fields (all nullable) + admin-uploaded media.
-- Rollback: DROP TABLE "Media"; ALTER TABLE "Vocabulary" DROP COLUMN "audioUrl", DROP COLUMN "dialect", DROP COLUMN "pronunciation", DROP COLUMN "source";
--           ALTER TABLE "Sentence" DROP COLUMN "audioUrl", DROP COLUMN "dialect", DROP COLUMN "note", DROP COLUMN "source";

-- AlterTable
ALTER TABLE "Vocabulary" ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "dialect" TEXT,
ADD COLUMN     "pronunciation" TEXT,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "Sentence" ADD COLUMN     "audioUrl" TEXT,
ADD COLUMN     "dialect" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);
