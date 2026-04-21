-- GDPR Suspension Tables Migration
-- Implements Right to Restriction of Processing (GDPR Article 18)

-- Add new values to GdprRequestType enum
ALTER TYPE "gdpr_request_type" ADD VALUE IF NOT EXISTS 'GDPR_SUSPEND';

-- Add new values to GdprRequestStatus enum
ALTER TYPE "gdpr_request_status" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Add new values to GdprAuditAction enum
ALTER TYPE "gdpr_audit_action" ADD VALUE IF NOT EXISTS 'SUSPEND';
ALTER TYPE "gdpr_audit_action" ADD VALUE IF NOT EXISTS 'RESUME';

-- AccountSuspension table - Source of truth for suspension state
CREATE TABLE IF NOT EXISTS "account_suspensions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_user_id" TEXT NOT NULL,
    "suspension_uid" TEXT NOT NULL,
    "anonymized_uid" TEXT NOT NULL,
    "suspended_at" TIMESTAMP(3) NOT NULL,
    "suspended_until" TIMESTAMP(3),
    "resumed_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_suspensions_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on suspension_uid
CREATE UNIQUE INDEX IF NOT EXISTS "account_suspensions_suspension_uid_key" ON "account_suspensions"("suspension_uid");

-- Index for user lookups
CREATE INDEX IF NOT EXISTS "account_suspensions_external_user_id_idx" ON "account_suspensions"("external_user_id");

-- Index for escalation cron job
CREATE INDEX IF NOT EXISTS "account_suspensions_suspended_until_expired_at_idx" ON "account_suspensions"("suspended_until", "expired_at");

-- SuspensionBackup table - Reversible snapshots for resume
CREATE TABLE IF NOT EXISTS "suspension_backups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "suspension_uid" TEXT NOT NULL,
    "external_user_id" TEXT NOT NULL,
    "anonymized_uid" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "backup_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restored_at" TIMESTAMP(3),

    CONSTRAINT "suspension_backups_pkey" PRIMARY KEY ("id")
);

-- Foreign key to account_suspensions
ALTER TABLE "suspension_backups" ADD CONSTRAINT "suspension_backups_suspension_uid_fkey" 
    FOREIGN KEY ("suspension_uid") REFERENCES "account_suspensions"("suspension_uid") 
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraint: one backup per table per suspension
CREATE UNIQUE INDEX IF NOT EXISTS "suspension_backups_suspension_uid_table_name_key" ON "suspension_backups"("suspension_uid", "table_name");

-- Index for user lookups
CREATE INDEX IF NOT EXISTS "suspension_backups_external_user_id_idx" ON "suspension_backups"("external_user_id");
