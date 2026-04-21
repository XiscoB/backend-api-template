-- CreateEnum
CREATE TYPE "delivery_retry_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'EXHAUSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "notification_events" (
    "id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_event_deliveries" (
    "id" UUID NOT NULL,
    "fk_notification_event" UUID NOT NULL,
    "channel_type" "notification_channel_type" NOT NULL,
    "status" "notification_delivery_status" NOT NULL,
    "target" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_event_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_retry_queue" (
    "id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "channel_type" "notification_channel_type" NOT NULL,
    "target" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "max_attempts" INTEGER NOT NULL,
    "next_retry_at" TIMESTAMP(3) NOT NULL,
    "last_error" TEXT,
    "status" "delivery_retry_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_retry_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_events_identity_id_idx" ON "notification_events"("identity_id");

-- CreateIndex
CREATE INDEX "notification_events_event_type_idx" ON "notification_events"("event_type");

-- CreateIndex
CREATE INDEX "notification_events_created_at_idx" ON "notification_events"("created_at");

-- CreateIndex
CREATE INDEX "notification_event_deliveries_fk_notification_event_idx" ON "notification_event_deliveries"("fk_notification_event");

-- CreateIndex
CREATE INDEX "notification_event_deliveries_status_idx" ON "notification_event_deliveries"("status");

-- CreateIndex
CREATE INDEX "delivery_retry_queue_status_next_retry_at_idx" ON "delivery_retry_queue"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "delivery_retry_queue_identity_id_idx" ON "delivery_retry_queue"("identity_id");

-- AddForeignKey
ALTER TABLE "notification_event_deliveries" ADD CONSTRAINT "notification_event_deliveries_fk_notification_event_fkey" FOREIGN KEY ("fk_notification_event") REFERENCES "notification_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
