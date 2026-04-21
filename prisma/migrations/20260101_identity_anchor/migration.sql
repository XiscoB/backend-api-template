-- Migration: Identity Anchor Pattern
-- This migration introduces the Identity table as the canonical ownership root
-- and refactors all domain tables to use identityId instead of externalUserId.
--
-- BREAKING CHANGE: This migration drops and recreates tables that previously
-- used externalUserId. Run with fresh database only (npm run docker:reset).
--
-- @see docs/create_tables_guideline.md
-- @see agents.md Section 8: Identity & Ownership Model

-- ============================================================================
-- Drop existing tables in reverse dependency order
-- ============================================================================

DROP TABLE IF EXISTS "suspension_backups" CASCADE;
DROP TABLE IF EXISTS "account_suspensions" CASCADE;
DROP TABLE IF EXISTS "email_verification_code" CASCADE;
DROP TABLE IF EXISTS "user_push_channel" CASCADE;
DROP TABLE IF EXISTS "user_email_channel" CASCADE;
DROP TABLE IF EXISTS "user_notification_profile" CASCADE;
DROP TABLE IF EXISTS "scheduled_notifications" CASCADE;
DROP TABLE IF EXISTS "notification_logs" CASCADE;
DROP TABLE IF EXISTS "gdpr_audit_logs" CASCADE;
DROP TABLE IF EXISTS "gdpr_requests" CASCADE;
DROP TABLE IF EXISTS "profiles" CASCADE;

-- Drop existing enums (will be recreated)
DROP TYPE IF EXISTS "scheduled_notification_status" CASCADE;
DROP TYPE IF EXISTS "gdpr_audit_action" CASCADE;
DROP TYPE IF EXISTS "gdpr_request_status" CASCADE;
DROP TYPE IF EXISTS "gdpr_request_type" CASCADE;

-- ============================================================================
-- Create Enums
-- ============================================================================

CREATE TYPE "gdpr_request_type" AS ENUM ('GDPR_EXPORT', 'GDPR_DELETE', 'GDPR_SUSPEND');
CREATE TYPE "gdpr_request_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "gdpr_audit_action" AS ENUM ('EXPORT_REQUESTED', 'EXPORT_STARTED', 'EXPORT_COMPLETED', 'EXPORT_FAILED', 'EXPORT_DOWNLOADED', 'EXPORT_EXPIRED', 'DELETE', 'SUSPEND', 'RESUME');
CREATE TYPE "scheduled_notification_status" AS ENUM ('PENDING', 'EXECUTED', 'FAILED', 'CANCELLED');

-- ============================================================================
-- Create Identity Table (OWNERSHIP ROOT)
-- ============================================================================

CREATE TABLE "identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_user_id" TEXT NOT NULL,
    "anonymized" BOOLEAN NOT NULL DEFAULT false,
    "is_suspended" BOOLEAN NOT NULL DEFAULT false,
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "last_activity" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identities_external_user_id_key" ON "identities"("external_user_id");

-- ============================================================================
-- Create Profile Table
-- ============================================================================

CREATE TABLE "profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "profiles_identity_id_key" ON "profiles"("identity_id");

ALTER TABLE "profiles" ADD CONSTRAINT "profiles_identity_id_fkey" 
    FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Create GDPR Request Table
-- ============================================================================

CREATE TABLE "gdpr_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "request_type" "gdpr_request_type" NOT NULL,
    "status" "gdpr_request_status" NOT NULL DEFAULT 'PENDING',
    "data_payload" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "gdpr_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gdpr_requests_identity_id_idx" ON "gdpr_requests"("identity_id");
CREATE INDEX "gdpr_requests_request_type_status_idx" ON "gdpr_requests"("request_type", "status");
CREATE INDEX "gdpr_requests_created_at_idx" ON "gdpr_requests"("created_at");

ALTER TABLE "gdpr_requests" ADD CONSTRAINT "gdpr_requests_identity_id_fkey" 
    FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Create GDPR Audit Log Table
-- ============================================================================

CREATE TABLE "gdpr_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "action" "gdpr_audit_action" NOT NULL,
    "entity_type" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "performed_by" TEXT NOT NULL,

    CONSTRAINT "gdpr_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gdpr_audit_logs_identity_id_idx" ON "gdpr_audit_logs"("identity_id");
CREATE INDEX "gdpr_audit_logs_action_idx" ON "gdpr_audit_logs"("action");
CREATE INDEX "gdpr_audit_logs_created_at_idx" ON "gdpr_audit_logs"("created_at");
CREATE INDEX "gdpr_audit_logs_performed_at_idx" ON "gdpr_audit_logs"("performed_at");

ALTER TABLE "gdpr_audit_logs" ADD CONSTRAINT "gdpr_audit_logs_identity_id_fkey" 
    FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Create Notification Log Table
-- ============================================================================

CREATE TABLE "notification_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actor_id" UUID,
    "visible_at" TIMESTAMP(3) NOT NULL,
    "read_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "anonymized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_logs_identity_id_deleted_at_idx" ON "notification_logs"("identity_id", "deleted_at");
CREATE INDEX "notification_logs_identity_id_visible_at_idx" ON "notification_logs"("identity_id", "visible_at" DESC);
CREATE INDEX "notification_logs_identity_id_read_at_idx" ON "notification_logs"("identity_id", "read_at");
CREATE INDEX "notification_logs_type_idx" ON "notification_logs"("type");

ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_identity_id_fkey" 
    FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Create Scheduled Notification Table
-- ============================================================================

CREATE TABLE "scheduled_notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actor_id" UUID,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "executed_at" TIMESTAMP(3),
    "status" "scheduled_notification_status" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "fk_notification_log" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scheduled_notifications_fk_notification_log_key" ON "scheduled_notifications"("fk_notification_log");
CREATE INDEX "scheduled_notifications_status_scheduled_at_idx" ON "scheduled_notifications"("status", "scheduled_at");
CREATE INDEX "scheduled_notifications_identity_id_idx" ON "scheduled_notifications"("identity_id");

ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_identity_id_fkey" 
    FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_fk_notification_log_fkey" 
    FOREIGN KEY ("fk_notification_log") REFERENCES "notification_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Create User Notification Profile Table
-- ============================================================================

CREATE TABLE "user_notification_profile" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_notification_profile_identity_id_key" ON "user_notification_profile"("identity_id");

ALTER TABLE "user_notification_profile" ADD CONSTRAINT "user_notification_profile_identity_id_fkey" 
    FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Create User Email Channel Table
-- ============================================================================

CREATE TABLE "user_email_channel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fk_user_notification_profile" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "promo_enabled" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "unsubscribe_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_email_channel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_email_channel_unsubscribe_token_key" ON "user_email_channel"("unsubscribe_token");
CREATE INDEX "user_email_channel_fk_user_notification_profile_idx" ON "user_email_channel"("fk_user_notification_profile");

ALTER TABLE "user_email_channel" ADD CONSTRAINT "user_email_channel_fk_user_notification_profile_fkey" 
    FOREIGN KEY ("fk_user_notification_profile") REFERENCES "user_notification_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Create Email Verification Code Table
-- ============================================================================

CREATE TABLE "email_verification_code" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fk_user_email_channel" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_code_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_verification_code_fk_user_email_channel_idx" ON "email_verification_code"("fk_user_email_channel");

ALTER TABLE "email_verification_code" ADD CONSTRAINT "email_verification_code_fk_user_email_channel_fkey" 
    FOREIGN KEY ("fk_user_email_channel") REFERENCES "user_email_channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Create User Push Channel Table
-- ============================================================================

CREATE TABLE "user_push_channel" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fk_user_notification_profile" UUID NOT NULL,
    "expo_token" TEXT NOT NULL,
    "unique_key" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_push_channel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_push_channel_fk_user_notification_profile_unique_key_key" ON "user_push_channel"("fk_user_notification_profile", "unique_key");
CREATE INDEX "user_push_channel_fk_user_notification_profile_idx" ON "user_push_channel"("fk_user_notification_profile");

ALTER TABLE "user_push_channel" ADD CONSTRAINT "user_push_channel_fk_user_notification_profile_fkey" 
    FOREIGN KEY ("fk_user_notification_profile") REFERENCES "user_notification_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Create Account Suspension Table
-- ============================================================================

CREATE TABLE "account_suspensions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identity_id" UUID NOT NULL,
    "suspension_uid" TEXT NOT NULL,
    "anonymized_uid" TEXT NOT NULL,
    "suspended_at" TIMESTAMP(3) NOT NULL,
    "suspended_until" TIMESTAMP(3),
    "resumed_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_suspensions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "account_suspensions_suspension_uid_key" ON "account_suspensions"("suspension_uid");
CREATE INDEX "account_suspensions_identity_id_idx" ON "account_suspensions"("identity_id");
CREATE INDEX "account_suspensions_suspended_until_expired_at_idx" ON "account_suspensions"("suspended_until", "expired_at");

ALTER TABLE "account_suspensions" ADD CONSTRAINT "account_suspensions_identity_id_fkey" 
    FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- Create Suspension Backup Table
-- ============================================================================

CREATE TABLE "suspension_backups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "suspension_uid" TEXT NOT NULL,
    "identity_id" UUID NOT NULL,
    "anonymized_uid" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "backup_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restored_at" TIMESTAMP(3),

    CONSTRAINT "suspension_backups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suspension_backups_suspension_uid_table_name_key" ON "suspension_backups"("suspension_uid", "table_name");
CREATE INDEX "suspension_backups_identity_id_idx" ON "suspension_backups"("identity_id");

ALTER TABLE "suspension_backups" ADD CONSTRAINT "suspension_backups_suspension_uid_fkey" 
    FOREIGN KEY ("suspension_uid") REFERENCES "account_suspensions"("suspension_uid") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "suspension_backups" ADD CONSTRAINT "suspension_backups_identity_id_fkey" 
    FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
