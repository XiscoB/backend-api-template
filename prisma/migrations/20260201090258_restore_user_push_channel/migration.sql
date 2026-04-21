-- CreateTable
CREATE TABLE "user_push_channel" (
    "id" UUID NOT NULL,
    "fk_user_notification_profile" UUID NOT NULL,
    "expo_token" TEXT NOT NULL,
    "unique_key" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_push_channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_push_channel_expo_token_key" ON "user_push_channel"("expo_token");

-- CreateIndex
CREATE INDEX "user_push_channel_fk_user_notification_profile_idx" ON "user_push_channel"("fk_user_notification_profile");

-- CreateIndex
CREATE INDEX "user_push_channel_expo_token_idx" ON "user_push_channel"("expo_token");

-- CreateIndex
CREATE UNIQUE INDEX "user_push_channel_fk_user_notification_profile_unique_key_key" ON "user_push_channel"("fk_user_notification_profile", "unique_key");

-- AddForeignKey
ALTER TABLE "user_push_channel" ADD CONSTRAINT "user_push_channel_fk_user_notification_profile_fkey" FOREIGN KEY ("fk_user_notification_profile") REFERENCES "user_notification_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
