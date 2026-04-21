/*
  Warnings:

  - A unique constraint covering the columns `[expo_token]` on the table `user_push_channel` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user_push_channel" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'unknown';

-- CreateIndex
CREATE UNIQUE INDEX "user_push_channel_expo_token_key" ON "user_push_channel"("expo_token");

-- CreateIndex
CREATE INDEX "user_push_channel_expo_token_idx" ON "user_push_channel"("expo_token");
