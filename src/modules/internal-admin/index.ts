/**
 * Internal Admin Console Module
 *
 * This module provides controlled operational access to database tables.
 *
 * WARNING: This is ops tooling for rare, manual interventions only.
 *
 * Security:
 * - Environment-gated (ADMIN_CONSOLE_ENABLED=true)
 * - Requires restart to enable/disable
 * - Mounted under /internal/admin
 * - Requires ADMIN_READ or ADMIN_WRITE JWT privilege
 * - Hardcoded table allowlists
 * - No bulk operations, no deletes
 *
 * Configuration:
 * - All settings are centralized in internal-admin.config.ts
 * - Import INTERNAL_ADMIN_CONFIG for access to all configuration
 */

export { InternalAdminModule } from './internal-admin.module';
export { InternalAdminService } from './internal-admin.service';
export { InternalAdminController } from './internal-admin.controller';

// Centralized Configuration (SINGLE SOURCE OF TRUTH)
export {
  INTERNAL_ADMIN_CONFIG,
  AdminPrivilege,
  ALL_ADMIN_PRIVILEGES,
  isAdminPrivilege,
  isTableVisible,
  isTableWritable,
  isFieldProtected,
} from './internal-admin.config';

// Legacy exports (for backward compatibility, prefer internal-admin.config.ts)
export {
  VISIBLE_TABLES,
  WRITEABLE_TABLES,
  HIDDEN_TABLES,
  ADMIN_CONSOLE_BASE_PATH,
} from './admin.constants';

// Types
export type {
  AdminUser,
  AdminQueryParams,
  AdminUpdateParams,
  AdminOperationResult,
} from './admin.types';

// Guards & Decorators
export { AdminPrivilegeGuard } from './admin-privilege.guard';
export { RequireAdminPrivilege, AdminReadOnly, AdminWriteRequired } from './admin.decorators';
export { CurrentAdminUser } from './current-admin-user.decorator';
