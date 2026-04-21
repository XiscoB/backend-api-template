/**
 * Authenticated Bootstrap DTOs
 *
 * Defines the public contract for POST /bootstrap endpoint.
 *
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                          CONTRACT DEFINITION                                   ║
 * ║                                                                               ║
 * ║   This DTO is a CONTRACT, not a convenience.                                  ║
 * ║   Changes must be explicit, reviewed, and intentional.                        ║
 * ║                                                                               ║
 * ║   RULES:                                                                      ║
 * ║   - Minimal user data only (status, roles, basic profile)                     ║
 * ║   - No app-level config (use public bootstrap for that)                       ║
 * ║   - No duplication of public bootstrap data                                   ║
 * ║   - No feature flags or policies                                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

import { IdentityStatus, AuthenticatedBootstrapResponse } from '../../bootstrap.types';

// ═══════════════════════════════════════════════════════════════════════════════
// Identity DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Identity context in bootstrap response.
 */
export interface BootstrapIdentityDto {
  /** Current identity status */
  status: IdentityStatus;

  /** User roles (only present when status is ACTIVE) */
  roles?: string[];

  /** Whether recovery is available (only present when status is SUSPENDED) */
  recoveryAvailable?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Profile DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Minimal profile context in bootstrap response.
 *
 * Contains only what's needed for app initialization.
 * Full profile should be fetched separately if needed.
 */
export interface BootstrapProfileDto {
  /** Profile ID */
  id: string;

  /** User's preferred locale (e.g., 'en', 'es') */
  locale: string;

  /** User's preferred timezone (e.g., 'UTC') */
  timezone: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Response DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Authenticated Bootstrap Response DTO
 *
 * The complete contract for authenticated user initialization.
 * Returned by POST /bootstrap
 *
 * RESPONSE VARIANTS:
 *
 * 1. ACTIVE user (full access):
 *    {
 *      "identity": { "status": "ACTIVE", "roles": ["USER"] },
 *      "profile": { "id": "uuid", "locale": "en", "timezone": "UTC" }
 *    }
 *
 * 2. SUSPENDED user (blocked, recovery possible):
 *    {
 *      "identity": { "status": "SUSPENDED", "recoveryAvailable": true }
 *    }
 *
 * 3. DELETED user (blocked, no recovery):
 *    {
 *      "identity": { "status": "DELETED" }
 *    }
 *
 * CLIENT USAGE:
 * 1. Call immediately after successful authentication
 * 2. Check identity.status to determine app access
 * 3. If ACTIVE, proceed to app with profile data
 * 4. If SUSPENDED with recoveryAvailable, show recovery option
 * 5. If DELETED, show account deleted message
 */
export interface AuthenticatedBootstrapResponseDto {
  /** Identity context (always present) */
  identity: BootstrapIdentityDto;

  /** Profile context (only present for ACTIVE users) */
  profile?: BootstrapProfileDto | null;
}

/**
 * Response DTO factory.
 *
 * Transforms internal service response to public DTO.
 */
export class AuthenticatedBootstrapDto {
  /**
   * Create DTO from service response.
   */
  static fromServiceResponse(
    response: AuthenticatedBootstrapResponse,
  ): AuthenticatedBootstrapResponseDto {
    return response as AuthenticatedBootstrapResponseDto;
  }
}
