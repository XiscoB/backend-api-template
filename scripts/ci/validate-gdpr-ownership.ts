#!/usr/bin/env node
/**
 * NOTE:
 * This script is intentionally TypeScript and executed via ts-node in CI.
 * It is NOT part of the Nest build output and must not be moved into src/.
 * CI tooling remains decoupled from application compilation.
 *
 * Rationale:
 * - Preserve strict type safety (no-unsafe-* ESLint rules)
 * - Avoid expanding tsconfig.build compilation surface
 * - Maintain deterministic CI execution
 */
/**
 *
 * GDPR Ownership Audit Script
 *
 * Validates that all Prisma models with identityId are classified in
 * GDPR_INCLUDED_TABLES or GDPR_EXCLUDED_TABLES.
 */

// Load Prisma DMMF (schema metadata)
import { Prisma } from '@prisma/client';

// Load GDPR registry constants
import { GDPR_INCLUDED_TABLES, GDPR_EXCLUDED_TABLES } from '../../src/config/app.constants';

// Load pure validation function
import { findUnclassifiedOwnershipModels } from '../../src/modules/gdpr/gdpr-ownership.check';

console.log('═══════════════════════════════════════════════════════════════════');
console.log('  GDPR Ownership Audit');
console.log('═══════════════════════════════════════════════════════════════════\n');

// Run the pure validation function
const violations = findUnclassifiedOwnershipModels(
  Prisma.dmmf,
  GDPR_INCLUDED_TABLES,
  GDPR_EXCLUDED_TABLES,
);

// Report results
console.log(`Models with identityId: checking classification...`);
console.log(`  GDPR_INCLUDED_TABLES: ${GDPR_INCLUDED_TABLES.length} entries`);
console.log(`  GDPR_EXCLUDED_TABLES: ${GDPR_EXCLUDED_TABLES.length} entries\n`);

if (violations.length === 0) {
  console.log('✅ GDPR ownership audit passed');
  console.log('   All models with identityId are properly classified.\n');
  process.exit(0);
} else {
  console.error('═══════════════════════════════════════════════════════════════════');
  console.error('  ❌ GDPR OWNERSHIP AUDIT FAILED');
  console.error('═══════════════════════════════════════════════════════════════════\n');
  console.error(`Found ${violations.length} unclassified model(s):\n`);

  for (const violation of violations) {
    console.error(`  ❌ ${violation.modelName}`);
    console.error(`     ${violation.message}\n`);
  }

  console.error('Action Required:');
  console.error('  1. Add to GDPR_INCLUDED_TABLES in src/config/app.constants.ts');
  console.error('     (if user-owned data that needs backup/export)');
  console.error('  OR');
  console.error('  2. Add to GDPR_EXCLUDED_TABLES in src/config/app.constants.ts');
  console.error('     (if infrastructure/audit table)\n');

  console.error('@see docs/canonical/GDPR_INVARIANTS.md for details.\n');

  process.exit(1);
}
