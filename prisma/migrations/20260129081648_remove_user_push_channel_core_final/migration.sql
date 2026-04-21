/*
  Warnings:

  - You are about to drop the `user_push_channel` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "user_push_channel" DROP CONSTRAINT "user_push_channel_fk_user_notification_profile_fkey";

-- DropTable
DROP TABLE "user_push_channel";
