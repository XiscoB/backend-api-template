-- CreateEnum
CREATE TYPE "notification_channel_type" AS ENUM ('EMAIL', 'PUSH', 'NONE');

-- CreateEnum
CREATE TYPE "notification_delivery_status" AS ENUM ('SENT', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "gdpr_requests" ADD COLUMN     "download_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_downloaded_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_notification_profile" ADD COLUMN     "notifications_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "notification_delivery_log" (
    "id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "fk_notification_profile" UUID,
    "event_type" TEXT NOT NULL,
    "channel_type" "notification_channel_type" NOT NULL,
    "status" "notification_delivery_status" NOT NULL,
    "reason" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_delivery_log_identity_id_idx" ON "notification_delivery_log"("identity_id");

-- CreateIndex
CREATE INDEX "notification_delivery_log_event_type_idx" ON "notification_delivery_log"("event_type");

-- CreateIndex
CREATE INDEX "notification_delivery_log_created_at_idx" ON "notification_delivery_log"("created_at");

-- CreateIndex
CREATE INDEX "gdpr_requests_status_expires_at_idx" ON "gdpr_requests"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "notification_delivery_log" ADD CONSTRAINT "notification_delivery_log_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_log" ADD CONSTRAINT "notification_delivery_log_fk_notification_profile_fkey" FOREIGN KEY ("fk_notification_profile") REFERENCES "user_notification_profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
