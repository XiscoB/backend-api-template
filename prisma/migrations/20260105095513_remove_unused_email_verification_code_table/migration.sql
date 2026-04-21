/*
  Warnings:

  - You are about to drop the `email_verification_code` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "email_verification_code" DROP CONSTRAINT "email_verification_code_fk_user_email_channel_fkey";

-- DropTable
DROP TABLE "email_verification_code";
