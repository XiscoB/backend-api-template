/*
  Warnings:

  - You are about to drop the `delivery_retry_queue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `notification_event_deliveries` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `notification_events` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "notification_event_deliveries" DROP CONSTRAINT "notification_event_deliveries_fk_notification_event_fkey";

-- AlterTable
ALTER TABLE "notification_delivery_log" ADD COLUMN     "target" TEXT;

-- DropTable
DROP TABLE "delivery_retry_queue";

-- DropTable
DROP TABLE "notification_event_deliveries";

-- DropTable
DROP TABLE "notification_events";

-- DropEnum
DROP TYPE "delivery_retry_status";
