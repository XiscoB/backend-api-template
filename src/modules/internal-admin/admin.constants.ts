/**
 * Internal Admin Console Constants
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️  DEPRECATED: Use internal-admin.config.ts instead  ⚠️
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file re-exports from the centralized config for backward compatibility.
 * All configuration is now defined in internal-admin.config.ts.
 *
 * For new code, import directly from './internal-admin.config'.
 */

import {
  INTERNAL_ADMIN_CONFIG,
  AdminPrivilege,
  ALL_ADMIN_PRIVILEGES,
  isAdminPrivilege,
  isTableVisible,
  isTableWritable,
  isFieldProtected,
} from './internal-admin.config';

// ─────────────────────────────────────────────────────────────
// Re-exports for backward compatibility
// ─────────────────────────────────────────────────────────────

// Privilege model
export { AdminPrivilege, ALL_ADMIN_PRIVILEGES, isAdminPrivilege };

// Table allowlists (derived from config)
export const VISIBLE_TABLES = INTERNAL_ADMIN_CONFIG.tables.visible;
export const WRITEABLE_TABLES = INTERNAL_ADMIN_CONFIG.tables.writable;
export const HIDDEN_TABLES = INTERNAL_ADMIN_CONFIG.tables.hidden;

// Helper functions
export { isTableVisible, isTableWritable, isFieldProtected };

// Mount path
export const ADMIN_CONSOLE_BASE_PATH = INTERNAL_ADMIN_CONFIG.mounting.basePath;
