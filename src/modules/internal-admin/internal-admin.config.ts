/**
 * Internal Admin Console Configuration
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️  THIS IS THE SINGLE SOURCE OF TRUTH FOR ADMIN CONSOLE CONFIGURATION  ⚠️
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * All internal admin console settings are centralized here.
 * To modify admin console behavior, edit ONLY this file and restart the backend.
 *
 * This is ops tooling for rare, manual interventions only.
 *
 * Security constraints enforced:
 * - Environment-gated (restart-only, no runtime toggles)
 * - Default-deny for all table access
 * - Hardcoded allowlists (no dynamic discovery)
 * - No bulk operations, no deletes
 * - Strict rate limiting
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1️⃣ PRIVILEGE MODEL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin privilege levels.
 *
 * Exactly two levels, no additions allowed:
 * - ADMIN_READ: Read-only access to visible tables
 * - ADMIN_WRITE: Read + limited write access (no deletes)
 *
 * These are separate from AppRole and used exclusively in the admin console.
 */
export enum AdminPrivilege {
  /** Read-only access to visible tables. No mutations allowed. */
  ADMIN_READ = 'ADMIN_READ',

  /** Read access + limited write access. Writes only to explicitly allowlisted tables. */
  ADMIN_WRITE = 'ADMIN_WRITE',
}

// ─────────────────────────────────────────────────────────────────────────────
// 2️⃣ TABLE MAPPING & ACCESS POLICY (HARDCODED)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Explicit mapping: database table name (snake_case) → Prisma client delegate (camelCase).
 *
 * CRITICAL: Do NOT use dynamic table access like prisma[tableName].
 * Prisma client delegates are camelCase, not snake_case table names.
 *
 * This mapping is the SINGLE SOURCE OF TRUTH for admin console table access.
 *
 * Rules:
 * - Table name (key) MUST match @@map() in prisma/schema.prisma
 * - Prisma delegate (value) MUST match the actual generated Prisma client property
 * - Only tables in this map can be accessed
 * - No dynamic discovery allowed
 */
/**
 * Admin Console Table Mapping.
 *
 * Maps database table names to Prisma client delegates.
 *
 * ALL admin-visible tables MUST follow this contract:
 * - Single primary key named 'id'
 * - DateTime field named 'createdAt' (may be aliased via @map)
 * - No conditional logic needed in admin service
 *
 * Prisma client delegates are camelCase, not snake_case table names.
 */
export const TABLE_TO_PRISMA_MAP = {
  // Identity anchor table - ownership root for all person-owned data
  identities: {
    prismaDelegate: 'identity',
    writable: true, // Allow updating deletedAt for grace period simulation in tests
  },
  profiles: {
    prismaDelegate: 'profile',
    writable: false,
  },
  gdpr_requests: {
    prismaDelegate: 'request',
    writable: false,
  },
  gdpr_audit_logs: {
    prismaDelegate: 'gdprAuditLog',
    writable: false,
  },
  notification_logs: {
    prismaDelegate: 'notificationLog',
    writable: true, // Allow marking as read/dismissed
  },
  scheduled_notifications: {
    prismaDelegate: 'scheduledNotification',
    writable: false,
  },
  user_notification_profile: {
    prismaDelegate: 'userNotificationProfile',
    writable: false,
  },
  user_email_channel: {
    prismaDelegate: 'userEmailChannel',
    writable: false,
  },
  user_push_channel: {
    prismaDelegate: 'userPushChannel',
    writable: false,
  },
  notification_delivery_log: {
    prismaDelegate: 'notificationDeliveryLog',
    writable: false,
  },
  account_suspensions: {
    prismaDelegate: 'accountSuspension',
    writable: false,
  },
  suspension_backups: {
    prismaDelegate: 'suspensionBackup',
    writable: false,
  },
} as const;

/**
 * Type-safe table names (derived from mapping keys).
 */
export type AdminTableName = keyof typeof TABLE_TO_PRISMA_MAP;

/**
 * Legacy table access configuration (derived from mapping for backwards compatibility).
 */
const TABLE_ACCESS = {
  /**
   * Tables that are VISIBLE to the admin console.
   * Derived from TABLE_TO_PRISMA_MAP keys.
   */
  VISIBLE: Object.keys(TABLE_TO_PRISMA_MAP) as readonly AdminTableName[],

  /**
   * Tables that are WRITABLE via admin console.
   * Derived from TABLE_TO_PRISMA_MAP where writable=true.
   */
  WRITABLE: Object.entries(TABLE_TO_PRISMA_MAP)
    .filter(([_, config]) => config.writable)
    .map(([table]) => table) as readonly AdminTableName[],

  /**
   * Tables that are NEVER exposed (even to ADMIN_WRITE).
   * Explicitly hidden for security reasons.
   *
   * These are blocked even if accidentally added to VISIBLE.
   */
  HIDDEN: [
    // No auth-related tables (handled externally)
    // Add sensitive tables here as needed
  ] as const,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 3️⃣ WRITE SAFETY RULES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write operation safety configuration.
 */
const WRITE_SAFETY = {
  /** Allow UPDATE operations on writable tables */
  allowUpdates: true,

  /** Allow DELETE operations (DISABLED - do not enable) */
  allowDeletes: false,

  /** Allow bulk operations (DISABLED - do not enable) */
  allowBulkOperations: false,

  /**
   * Fields that can NEVER be updated via admin console.
   * These are protected regardless of table.
   */
  protectedFields: ['id', 'createdAt', 'externalUserId', 'identityId', 'sub'] as const,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 4️⃣ RATE LIMITING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rate limit configuration for admin console.
 *
 * Uses the strictest tier. No overrides. No shared buckets.
 */
const RATE_LIMIT = {
  /** Rate limit tier name (must match rate-limit.config.ts) */
  tier: 'rl-internal-admin-strict' as const,

  /** Requests allowed per window */
  limit: 10,

  /** Window size in seconds */
  windowSeconds: 60,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 5️⃣ MOUNTING CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Admin console mounting configuration.
 */
const MOUNTING = {
  /**
   * Base path for internal admin console.
   * Must not share routing with public APIs (/api/*).
   */
  basePath: 'internal/admin',

  /**
   * Environment variable that controls enablement.
   * Read only at startup. Requires restart to change.
   */
  enablementEnvVar: 'ADMIN_CONSOLE_ENABLED',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 6️⃣ SAFETY FLAGS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safety and audit configuration.
 */
const SAFETY = {
  /** Require explicit table allowlisting (always true) */
  requireExplicitAllowlist: true,

  /** Log all write operations (always true for audit) */
  logWriteOperations: true,

  /** Log all read operations */
  logReadOperations: true,

  /** Fail-safe: deny access if no privilege decorator is present */
  denyByDefault: true,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CONSOLIDATED CONFIG EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Internal Admin Console Configuration.
 *
 * This is the SINGLE SOURCE OF TRUTH for all admin console settings.
 * Import this config object wherever admin console configuration is needed.
 *
 * @example
 * ```typescript
 * import { INTERNAL_ADMIN_CONFIG } from './internal-admin.config';
 *
 * const visibleTables = INTERNAL_ADMIN_CONFIG.tables.visible;
 * const rateLimitTier = INTERNAL_ADMIN_CONFIG.rateLimit.tier;
 * ```
 */
export const INTERNAL_ADMIN_CONFIG = {
  /**
   * Mounting configuration.
   */
  mounting: MOUNTING,

  /**
   * Admin privilege levels.
   */
  privileges: AdminPrivilege,

  /**
   * Table access policy.
   */
  tables: {
    visible: TABLE_ACCESS.VISIBLE,
    writable: TABLE_ACCESS.WRITABLE,
    hidden: TABLE_ACCESS.HIDDEN,
  },

  /**
   * Write safety rules.
   */
  writeSafety: WRITE_SAFETY,

  /**
   * Rate limiting configuration.
   */
  rateLimit: RATE_LIMIT,

  /**
   * Safety and audit flags.
   */
  safety: SAFETY,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPE EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

/** Type for visible table names */
export type VisibleTable = (typeof TABLE_ACCESS.VISIBLE)[number];

/** Type for writable table names */
export type WritableTable = (typeof TABLE_ACCESS.WRITABLE)[number];

/** Type for hidden table names */
export type HiddenTable = (typeof TABLE_ACCESS.HIDDEN)[number];

/** Type for protected field names */
export type ProtectedField = (typeof WRITE_SAFETY.protectedFields)[number];

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATION (runs at module load time)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate configuration consistency.
 * Runs at module load time to catch configuration errors early.
 */
function validateConfiguration(): void {
  const { visible, writable, hidden } = INTERNAL_ADMIN_CONFIG.tables;

  const visibleSet = new Set<string>(visible);
  const hiddenSet = new Set<string>(hidden);

  // Validate: WRITABLE ⊆ VISIBLE
  for (const table of writable) {
    if (!visibleSet.has(table)) {
      throw new Error(
        `Internal Admin Config Error: WRITABLE table "${table}" is not in VISIBLE tables`,
      );
    }
    if (hiddenSet.has(table)) {
      throw new Error(`Internal Admin Config Error: WRITABLE table "${table}" is in HIDDEN tables`);
    }
  }

  // Validate: VISIBLE ∩ HIDDEN = ∅
  for (const table of visible) {
    if (hiddenSet.has(table)) {
      throw new Error(`Internal Admin Config Error: VISIBLE table "${table}" is in HIDDEN tables`);
    }
  }

  // Validate: Write safety flags
  if (INTERNAL_ADMIN_CONFIG.writeSafety.allowDeletes) {
    throw new Error('Internal Admin Config Error: allowDeletes must be false');
  }

  if (INTERNAL_ADMIN_CONFIG.writeSafety.allowBulkOperations) {
    throw new Error('Internal Admin Config Error: allowBulkOperations must be false');
  }
}

// Run validation at module load time
validateConfiguration();

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if a table is visible in the admin console.
 */
export function isTableVisible(tableName: string): boolean {
  const { visible, hidden } = INTERNAL_ADMIN_CONFIG.tables;

  if ((hidden as readonly string[]).includes(tableName)) {
    return false;
  }
  return (visible as readonly string[]).includes(tableName);
}

/**
 * Check if a table is writable via the admin console.
 */
export function isTableWritable(tableName: string): boolean {
  const { writable, hidden } = INTERNAL_ADMIN_CONFIG.tables;

  if ((hidden as readonly string[]).includes(tableName)) {
    return false;
  }
  return (writable as readonly string[]).includes(tableName);
}

/**
 * Check if a field is protected from updates.
 */
export function isFieldProtected(fieldName: string): boolean {
  return (INTERNAL_ADMIN_CONFIG.writeSafety.protectedFields as readonly string[]).includes(
    fieldName,
  );
}

/**
 * All admin privileges as an array.
 */
export const ALL_ADMIN_PRIVILEGES: AdminPrivilege[] = Object.values(AdminPrivilege);

/**
 * Check if a string is a valid admin privilege.
 */
export function isAdminPrivilege(value: string): value is AdminPrivilege {
  return ALL_ADMIN_PRIVILEGES.includes(value as AdminPrivilege);
}
