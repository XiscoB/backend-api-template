-- Add standard timestamps to all tables for admin console consistency
-- All admin-visible tables must have: id, created_at, updated_at

-- ─────────────────────────────────────────────────────────────
-- Step 1: Add created_at and updated_at to gdpr_requests
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "gdpr_requests" 
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create index on created_at for admin console ordering
CREATE INDEX "gdpr_requests_created_at_idx" ON "gdpr_requests"("created_at");

-- ─────────────────────────────────────────────────────────────
-- Step 2: Add created_at and updated_at to gdpr_audit_logs
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "gdpr_audit_logs" 
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Create index on created_at for admin console ordering
CREATE INDEX "gdpr_audit_logs_created_at_idx" ON "gdpr_audit_logs"("created_at");

-- Note: requested_at and performed_at remain for business logic
-- All admin console queries will use created_at for consistency
