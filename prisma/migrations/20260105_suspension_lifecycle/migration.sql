-- Suspension & Recovery Enhancement Migration
-- Adds lifecycle state management and backup metadata

-- Create enum for suspension lifecycle states
CREATE TYPE "suspension_lifecycle_state" AS ENUM ('ACTIVE', 'SUSPENDED', 'RECOVERED', 'EXPIRED');

-- Add lifecycle state column to account_suspensions
ALTER TABLE "account_suspensions" ADD COLUMN "lifecycle_state" "suspension_lifecycle_state" NOT NULL DEFAULT 'SUSPENDED';

-- Add recovered_at column (distinct from resumed_at for clarity)
ALTER TABLE "account_suspensions" ADD COLUMN "recovered_at" TIMESTAMP(3);

-- Add last_recovery_at for cooldown enforcement
ALTER TABLE "account_suspensions" ADD COLUMN "last_recovery_at" TIMESTAMP(3);

-- Add index on lifecycle_state for efficient querying
CREATE INDEX "account_suspensions_lifecycle_state_idx" ON "account_suspensions"("lifecycle_state");

-- Update existing suspensions to have correct lifecycle state
UPDATE "account_suspensions" 
SET "lifecycle_state" = 'RECOVERED'
WHERE "resumed_at" IS NOT NULL AND "expired_at" IS NULL;

UPDATE "account_suspensions" 
SET "lifecycle_state" = 'EXPIRED'
WHERE "expired_at" IS NOT NULL;

-- Add backup metadata to suspension_backups
ALTER TABLE "suspension_backups" ADD COLUMN "backup_schema_version" TEXT NOT NULL DEFAULT '1.0';
ALTER TABLE "suspension_backups" ADD COLUMN "backup_used" BOOLEAN NOT NULL DEFAULT false;

-- Add index on backup_used for efficient cleanup queries
CREATE INDEX "suspension_backups_backup_used_idx" ON "suspension_backups"("backup_used");

-- Mark existing restored backups as used
UPDATE "suspension_backups" 
SET "backup_used" = true
WHERE "restored_at" IS NOT NULL;
