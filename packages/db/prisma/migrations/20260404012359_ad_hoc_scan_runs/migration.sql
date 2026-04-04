-- AlterTable
ALTER TABLE "scan_run" ADD COLUMN     "userId" TEXT,
ALTER COLUMN "scheduleId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "scan_run_userId_idx" ON "scan_run"("userId");

-- AddForeignKey
ALTER TABLE "scan_run" ADD CONSTRAINT "scan_run_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
