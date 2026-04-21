/**
 * Application roles.
 *
 * These roles define authorization levels for the application.
 * Roles are sourced from JWT claims (`realm_access.roles`).
 *
 * This enum is part of the stable v1 API contract.
 * Do not modify existing values without versioning consideration.
 *
 * Role Hierarchy (conceptual, not enforced):
 * - USER: Standard authenticated user
 * - ENTITY: Organization or business entity
 * - ADMIN: Administrative user with elevated privileges
 * - SYSTEM: Internal service-to-service communication
 */
export enum AppRole {
  /**
   * Standard authenticated user.
   * Typical end-user with basic access.
   */
  USER = 'USER',

  /**
   * Entity user (organization, company, etc.).
   * Represents a business entity rather than an individual.
   */
  ENTITY = 'ENTITY',

  /**
   * Administrative user.
   * Has elevated privileges for management operations.
   */
  ADMIN = 'ADMIN',

  /**
   * System role for internal services.
   * Used for service-to-service communication.
   */
  SYSTEM = 'SYSTEM',
}

/**
 * All application roles as an array.
 * Useful for validation and iteration.
 */
export const ALL_APP_ROLES: AppRole[] = Object.values(AppRole);

/**
 * Check if a string is a valid application role.
 */
export function isAppRole(role: string): role is AppRole {
  return ALL_APP_ROLES.includes(role as AppRole);
}

/**
 * Filter raw JWT roles to only include recognized application roles.
 *
 * This ensures we only work with known roles and ignore
 * any identity-provider-specific or unrecognized roles.
 */
export function filterToAppRoles(roles: string[]): AppRole[] {
  return roles.filter(isAppRole);
}
