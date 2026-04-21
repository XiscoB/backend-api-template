-- CreateEnum
CREATE TYPE "scheduled_notification_status" AS ENUM ('PENDING', 'EXECUTED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actor_user_id" TEXT,
    "visible_at" TIMESTAMP(3) NOT NULL,
    "read_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "anonymized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_notifications" (
    "id" UUID NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actor_user_id" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "executed_at" TIMESTAMP(3),
    "status" "scheduled_notification_status" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "fk_notification_log" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_logs_external_user_id_deleted_at_idx" ON "notification_logs"("external_user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "notification_logs_external_user_id_visible_at_idx" ON "notification_logs"("external_user_id", "visible_at");

-- CreateIndex
CREATE INDEX "notification_logs_type_idx" ON "notification_logs"("type");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_notifications_fk_notification_log_key" ON "scheduled_notifications"("fk_notification_log");

-- CreateIndex
CREATE INDEX "scheduled_notifications_status_scheduled_at_idx" ON "scheduled_notifications"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "scheduled_notifications_external_user_id_idx" ON "scheduled_notifications"("external_user_id");

-- AddForeignKey
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_fk_notification_log_fkey" FOREIGN KEY ("fk_notification_log") REFERENCES "notification_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
