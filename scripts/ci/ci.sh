#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────
# CANONICAL CI ENTRYPOINT
# ─────────────────────────────────────────────────────────────────
# This script encodes the exact sequence of steps required to 
# verify the application in a Continuous Integration environment.
#
# CI providers (GitHub Actions, GitLab CI, etc.) should call this 
# script directly instead of duplicating logic in YAML.
#
# Assumptions:
# - Node.js and NPM are installed
# - PostgreSQL is reachable via DATABASE_URL
# - Environment variables (NODE_ENV, JWT_PUBLIC_KEY) are set
# - No .env file loading (infra responsibility)
#
# ─────────────────────────────────────────────────────────────────

echo "--- [CI] Starting Canonical CI Pipeline ---"

# 1. Verification of Environment
# Fail fast if essential variables are missing
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ Error: DATABASE_URL is not set."
  exit 1
fi

if [ -z "${JWT_PUBLIC_KEY:-}" ]; then
  echo "❌ Error: JWT_PUBLIC_KEY is not set (required for boot)."
  exit 1
fi

# Ensure we are in test mode
export NODE_ENV=${NODE_ENV:-test}
echo "✅ Environment: NODE_ENV=${NODE_ENV}"


# 2. Dependency Installation
echo "--- [CI] Installing Dependencies ---"
# npm ci is faster and stricter than npm install
npm ci


# 3. Code Generation
echo "--- [CI] Generating Code ---"
# Generate Prisma Client (required for everything)
npm run prisma:generate

# Generate Admin Tables (required for build/boot)
npm run generate:admin


# 4. Database Provisioning
echo "--- [CI] Applying Database Migrations ---"
# Applies schema changes to the connected DB.
# Fails if the DB is unreachable or migrations are invalid.
npm run prisma:migrate:deploy


# 5. Static Analysis
echo "--- [CI] Static Analysis (Linting & Schema) ---"
# Best-effort static checks before running heavy tests
npm run lint
npm run prisma:validate


# 5.5 GDPR Registry Ownership Audit
echo "--- [CI] GDPR Registry Ownership Audit ---"
npx ts-node --project tsconfig.json scripts/ci/validate-gdpr-ownership.ts


# 6. Unit & Integration Tests
echo "--- [CI] Running Unit & Integration Tests ---"
npm test


# 7. End-to-End Tests
echo "--- [CI] Running End-to-End Tests ---"
npm run test:e2e


echo "--- [CI] ✅ Pipeline Success ---"
