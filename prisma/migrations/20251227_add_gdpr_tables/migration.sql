-- GDPR Data Export Feature Migration
-- This migration adds tables for GDPR compliance features:
-- 1. Creates gdpr_requests table for tracking export requests
-- 2. Creates gdpr_audit_logs table for compliance audit trail
-- 3. Creates required enums for request types and statuses

-- ─────────────────────────────────────────────────────────────
-- Step 1: Create GDPR enums
-- ─────────────────────────────────────────────────────────────

-- GDPR Request Types
CREATE TYPE "gdpr_request_type" AS ENUM ('GDPR_EXPORT', 'GDPR_DELETE', 'GDPR_SUSPEND');

-- GDPR Request Statuses
CREATE TYPE "gdpr_request_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- GDPR Audit Actions
CREATE TYPE "gdpr_audit_action" AS ENUM (
  'EXPORT_REQUESTED',
  'EXPORT_STARTED',
  'EXPORT_COMPLETED',
  'EXPORT_FAILED',
  'EXPORT_DOWNLOADED',
  'EXPORT_EXPIRED',
  'DELETE',
  'SUSPEND',
  'RESUME'
);

-- ─────────────────────────────────────────────────────────────
-- Step 2: Create gdpr_requests table
-- ─────────────────────────────────────────────────────────────
-- Tracks GDPR data requests (export, future deletion, etc.)
-- This is an infrastructure table and excluded from GDPR exports.

CREATE TABLE "gdpr_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fk_user" TEXT NOT NULL,
  "request_type" "gdpr_request_type" NOT NULL,
  "status" "gdpr_request_status" NOT NULL DEFAULT 'PENDING',
  "data_payload" JSONB,
  "error_message" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),

  CONSTRAINT "gdpr_requests_pkey" PRIMARY KEY ("id")
);

-- Indexes for common query patterns
CREATE INDEX "gdpr_requests_fk_user_idx" ON "gdpr_requests"("fk_user");
CREATE INDEX "gdpr_requests_request_type_status_idx" ON "gdpr_requests"("request_type", "status");

-- ─────────────────────────────────────────────────────────────
-- Step 3: Create gdpr_audit_logs table
-- ─────────────────────────────────────────────────────────────
-- Immutable audit trail for all GDPR-related operations.
-- This is an infrastructure table and excluded from GDPR exports.
-- Required for GDPR compliance - must be retained for legal purposes.

CREATE TABLE "gdpr_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fk_user" TEXT NOT NULL,
  "action" "gdpr_audit_action" NOT NULL,
  "entity_type" TEXT,
  "metadata" JSONB,
  "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "performed_by" TEXT NOT NULL,

  CONSTRAINT "gdpr_audit_logs_pkey" PRIMARY KEY ("id")
);

-- Indexes for common query patterns
CREATE INDEX "gdpr_audit_logs_fk_user_idx" ON "gdpr_audit_logs"("fk_user");
CREATE INDEX "gdpr_audit_logs_action_idx" ON "gdpr_audit_logs"("action");
CREATE INDEX "gdpr_audit_logs_performed_at_idx" ON "gdpr_audit_logs"("performed_at");
