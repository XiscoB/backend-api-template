import { SetMetadata } from '@nestjs/common';
import { AppRole } from '../constants/roles';

export const ROLES_KEY = 'roles';

/**
 * Requires specific roles to access a route.
 *
 * The user must have at least one of the specified roles.
 * Roles are extracted from the JWT's `realm_access.roles` claim.
 *
 * @deprecated Use @RequireRole() or @RequireAnyRole() for type safety
 * @param roles - One or more role names
 */
export const Roles = (...roles: AppRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);

/**
 * Requires a single role to access a route.
 *
 * Use this when a route should only be accessible by one specific role.
 *
 * @param role - The required role
 *
 * @example
 * ```typescript
 * @RequireRole(AppRole.ADMIN)
 * @Get('admin/dashboard')
 * adminDashboard() {
 *   return { message: 'Admin only' };
 * }
 * ```
 */
export const RequireRole = (role: AppRole): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, [role]);

/**
 * Requires any one of the specified roles to access a route.
 *
 * Use this when a route should be accessible by multiple roles.
 * The user only needs ONE of the specified roles (OR logic).
 *
 * @param roles - One or more required roles (user needs at least one)
 *
 * @example
 * ```typescript
 * @RequireAnyRole(AppRole.ADMIN, AppRole.SYSTEM)
 * @Get('internal/stats')
 * internalStats() {
 *   return { message: 'Admin or system' };
 * }
 *
 * @RequireAnyRole(AppRole.USER, AppRole.ENTITY)
 * @Get('me')
 * getProfile() {
 *   return { message: 'Any authenticated user or entity' };
 * }
 * ```
 */
export const RequireAnyRole = (...roles: AppRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
