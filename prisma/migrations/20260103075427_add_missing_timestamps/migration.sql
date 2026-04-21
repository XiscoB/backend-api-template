/*
  Warnings:

  - Added the required column `updated_at` to the `account_suspensions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `email_verification_code` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `notification_logs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `scheduled_notifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `suspension_backups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `user_email_channel` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "suspension_backups" DROP CONSTRAINT "suspension_backups_suspension_uid_fkey";

-- AlterTable
ALTER TABLE "account_suspensions" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "email_verification_code" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "gdpr_audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "gdpr_requests" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "identities" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_logs" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "profiles" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "scheduled_notifications" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "suspension_backups" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_email_channel" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_notification_profile" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "user_push_channel" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "id" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "suspension_backups" ADD CONSTRAINT "suspension_backups_suspension_uid_fkey" FOREIGN KEY ("suspension_uid") REFERENCES "account_suspensions"("suspension_uid") ON DELETE RESTRICT ON UPDATE CASCADE;
