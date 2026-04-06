-- AlterTable
ALTER TABLE "scan_schedule" ADD COLUMN     "notificationConfigId" TEXT;

-- AddForeignKey
ALTER TABLE "scan_schedule" ADD CONSTRAINT "scan_schedule_notificationConfigId_fkey" FOREIGN KEY ("notificationConfigId") REFERENCES "notification_config"("id") ON DELETE SET NULL ON UPDATE CASCADE;
