import { SetMetadata } from '@nestjs/common';
import { AdminPrivilege } from './admin.constants';

/**
 * Metadata key for admin privilege requirements.
 */
export const ADMIN_PRIVILEGE_KEY = 'adminPrivilege';

/**
 * Require specific admin privilege to access a route.
 *
 * This decorator is separate from the public @RequireRole() decorator.
 * It is used exclusively within the internal admin console.
 *
 * @param privilege - The required admin privilege
 *
 * @example
 * ```typescript
 * @RequireAdminPrivilege(AdminPrivilege.ADMIN_READ)
 * @Get('tables')
 * listTables() {
 *   return this.adminService.listVisibleTables();
 * }
 * ```
 */
export const RequireAdminPrivilege = (privilege: AdminPrivilege): ReturnType<typeof SetMetadata> =>
  SetMetadata(ADMIN_PRIVILEGE_KEY, privilege);

/**
 * Require ADMIN_READ privilege.
 * Convenience decorator for read-only endpoints.
 */
export const AdminReadOnly = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(ADMIN_PRIVILEGE_KEY, AdminPrivilege.ADMIN_READ);

/**
 * Require ADMIN_WRITE privilege.
 * Convenience decorator for write endpoints.
 */
export const AdminWriteRequired = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(ADMIN_PRIVILEGE_KEY, AdminPrivilege.ADMIN_WRITE);
