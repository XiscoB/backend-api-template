-- CreateTable
CREATE TABLE "user_notification_profile" (
    "id" UUID NOT NULL,
    "fk_user" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_email_channel" (
    "id" UUID NOT NULL,
    "fk_user_notification_profile" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "promo_enabled" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribe_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_email_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_code" (
    "id" UUID NOT NULL,
    "fk_user_email_channel" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_push_channel" (
    "id" UUID NOT NULL,
    "fk_user_notification_profile" UUID NOT NULL,
    "expo_token" TEXT NOT NULL,
    "unique_key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_push_channel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_profile_fk_user_key" ON "user_notification_profile"("fk_user");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_channel_unsubscribe_token_key" ON "user_email_channel"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "user_email_channel_fk_user_notification_profile_idx" ON "user_email_channel"("fk_user_notification_profile");

-- CreateIndex
CREATE INDEX "email_verification_code_fk_user_email_channel_idx" ON "email_verification_code"("fk_user_email_channel");

-- CreateIndex
CREATE INDEX "user_push_channel_fk_user_notification_profile_idx" ON "user_push_channel"("fk_user_notification_profile");

-- CreateIndex
CREATE UNIQUE INDEX "user_push_channel_fk_user_notification_profile_unique_key_key" ON "user_push_channel"("fk_user_notification_profile", "unique_key");

-- AddForeignKey
ALTER TABLE "user_email_channel" ADD CONSTRAINT "user_email_channel_fk_user_notification_profile_fkey" FOREIGN KEY ("fk_user_notification_profile") REFERENCES "user_notification_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_code" ADD CONSTRAINT "email_verification_code_fk_user_email_channel_fkey" FOREIGN KEY ("fk_user_email_channel") REFERENCES "user_email_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_push_channel" ADD CONSTRAINT "user_push_channel_fk_user_notification_profile_fkey" FOREIGN KEY ("fk_user_notification_profile") REFERENCES "user_notification_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
