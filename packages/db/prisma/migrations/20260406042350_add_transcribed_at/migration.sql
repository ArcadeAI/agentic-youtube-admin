-- AlterTable
ALTER TABLE "tracked_video" ADD COLUMN     "transcribedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "video" ADD COLUMN     "transcribedAt" TIMESTAMP(3);
