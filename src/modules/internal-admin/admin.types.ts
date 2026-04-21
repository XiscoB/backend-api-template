/**
 * Internal Admin Console Types
 *
 * Type definitions for the admin console.
 */

import { AdminPrivilege } from './admin.constants';

/**
 * Authenticated admin user.
 *
 * Extended from the regular authenticated user with admin privileges.
 */
export interface AdminUser {
  /** User ID from JWT sub claim */
  readonly sub: string;

  /** User email (optional) */
  readonly email?: string;

  /** Admin privilege level */
  readonly adminPrivilege: AdminPrivilege;
}

/**
 * Admin query parameters for table reads.
 */
export interface AdminQueryParams {
  /** Table name (must be in VISIBLE_TABLES) */
  readonly table: string;

  /** Maximum number of records to return (default: 50, max: 100) */
  readonly limit?: number;

  /** Offset for pagination (default: 0) */
  readonly offset?: number;

  /** Field to filter by (optional) */
  readonly filterField?: string;

  /** Value to filter by (optional, requires filterField) */
  readonly filterValue?: string;
}

/**
 * Admin update parameters.
 */
export interface AdminUpdateParams {
  /** Table name (must be in WRITEABLE_TABLES) */
  readonly table: string;

  /** Record ID to update */
  readonly id: string;

  /** Fields to update (explicit, no bulk operations) */
  readonly data: Record<string, unknown>;
}

/**
 * Admin operation result.
 */
export interface AdminOperationResult {
  /** Whether the operation succeeded */
  readonly success: boolean;

  /** Number of affected records */
  readonly affectedCount: number;

  /** Operation timestamp */
  readonly timestamp: string;
}

/**
 * Admin table info response.
 */
export interface AdminTableInfo {
  /** Table name */
  readonly name: string;

  /** Whether the table is readable */
  readonly readable: boolean;

  /** Whether the table is writable */
  readonly writable: boolean;
}
