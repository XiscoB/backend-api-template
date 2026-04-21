/**
 * GDPR Ownership Check (Pure Function)
 *
 * Validates that all Prisma models with `identityId` field are properly
 * classified in the GDPR registry.
 *
 * This is a PURE FUNCTION with no side effects:
 * - No DI dependencies
 * - No environment assumptions
 * - No logging or throwing
 * - Returns data only
 *
 * Used by:
 * - GdprEnforcementService (runtime enforcement)
 * - validate-gdpr-ownership.js (CI/audit script)
 *
 * @see docs/canonical/GDPR_INVARIANTS.md for the invariant definition
 */

import { Prisma } from '@prisma/client';

/**
 * A violation of the GDPR ownership invariant.
 */
export interface GdprOwnershipViolation {
  /** The Prisma model name that violates the invariant */
  modelName: string;
  /** Human-readable explanation of the violation */
  message: string;
}

/**
 * DMMF Document type for Prisma schema metadata.
 * Extracted for type safety without requiring deep Prisma imports.
 */
type DmmfDocument = typeof Prisma.dmmf extends infer T ? T : never;

/**
 * Find Prisma models with `identityId` that are not classified in GDPR registry.
 *
 * The GDPR Ownership Invariant requires that every model containing `identityId`
 * (or equivalent ownership marker) MUST be explicitly listed in either:
 * - GDPR_INCLUDED_TABLES (user-owned data, backed up during suspension)
 * - GDPR_EXCLUDED_TABLES (infrastructure, deleted via CASCADE)
 *
 * @param dmmf - Prisma DMMF metadata (Prisma.dmmf)
 * @param includedTables - GDPR_INCLUDED_TABLES from app.constants.ts
 * @param excludedTables - GDPR_EXCLUDED_TABLES from app.constants.ts
 * @returns List of violations (empty array if all models are properly classified)
 */
export function findUnclassifiedOwnershipModels(
  dmmf: DmmfDocument,
  includedTables: readonly string[],
  excludedTables: readonly string[],
): GdprOwnershipViolation[] {
  const violations: GdprOwnershipViolation[] = [];

  // Build sets for O(1) lookup
  const includedSet = new Set(includedTables);
  const excludedSet = new Set(excludedTables);

  for (const model of dmmf.datamodel.models) {
    const modelName = model.name;

    // Check if model has identityId field (direct ownership marker)
    const hasIdentityId = model.fields.some(
      (field: { name: string }) => field.name === 'identityId',
    );

    if (!hasIdentityId) {
      continue; // Not a user-related table, skip
    }

    // Check if properly classified
    const isIncluded = includedSet.has(modelName);
    const isExcluded = excludedSet.has(modelName);

    if (isIncluded || isExcluded) {
      continue; // Properly classified
    }

    // Violation found — has identityId but not classified
    violations.push({
      modelName,
      message:
        `Model '${modelName}' has 'identityId' field but is not classified in GDPR registry. ` +
        `Add it to GDPR_INCLUDED_TABLES (if user data) or GDPR_EXCLUDED_TABLES (if infrastructure).`,
    });
  }

  return violations;
}
