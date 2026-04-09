-- AlterTable
ALTER TABLE "video" ADD COLUMN "summary" TEXT,
ADD COLUMN "summarizedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tracked_video" ADD COLUMN "summary" TEXT,
ADD COLUMN "summarizedAt" TIMESTAMP(3);
