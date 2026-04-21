-- AlterEnum
ALTER TYPE "scheduled_notification_status" ADD VALUE 'PROCESSED';

-- DropIndex
DROP INDEX "scheduled_notifications_identity_id_idx";

-- DropIndex
DROP INDEX "scheduled_notifications_status_scheduled_at_idx";

-- AlterTable
ALTER TABLE "scheduled_notifications" ADD COLUMN     "processed_at" TIMESTAMP(3),
ADD COLUMN     "unique_key" TEXT;

-- CreateIndex
CREATE INDEX "scheduled_notifications_identity_id_unique_key_status_idx" ON "scheduled_notifications"("identity_id", "unique_key", "status");
