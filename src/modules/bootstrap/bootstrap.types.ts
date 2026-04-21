/**
 * Bootstrap Types
 *
 * Defines the identity status model for authenticated bootstrap.
 * This is the canonical definition of user account states.
 *
 * @see docs/canonical/AUTH_CONTRACT.md
 */

/**
 * Identity status for authenticated bootstrap.
 *
 * Represents the current state of a user's account:
 * - ACTIVE: Normal, fully functional account
 * - BANNED: Permanently banned due to abuse/policy violation (irreversible, admin-only)
 * - SUSPENDED: Account is suspended (Right to Restriction)
 * - DELETED: Account has been permanently deleted (anonymized)
 * - PENDING_RECOVERY: Account is suspended but recovery is available
 * - PENDING_DELETION: Account deletion requested, in grace period
 *
 * IMPORTANT: These statuses are derived from Identity model fields:
 * - isBanned: true → BANNED (highest priority, permanent, no recovery)
 * - anonymized: true → DELETED (final, irreversible)
 * - deletedAt: set + anonymized: false → PENDING_DELETION (grace period)
 * - isSuspended: true → SUSPENDED or PENDING_RECOVERY
 * - Neither → ACTIVE
 *
 * Status priority (first match wins):
 * 1. isBanned = true → BANNED (highest priority)
 * 2. anonymized = true → DELETED
 * 3. deletedAt != null → PENDING_DELETION
 * 4. isSuspended = true → SUSPENDED or PENDING_RECOVERY
 * 5. Otherwise → ACTIVE
 */
export type IdentityStatus =
  | 'ACTIVE'
  | 'BANNED'
  | 'SUSPENDED'
  | 'DELETED'
  | 'PENDING_RECOVERY'
  | 'PENDING_DELETION';

/**
 * Minimal identity context for authenticated bootstrap.
 *
 * Contains only what the client needs to determine app access.
 */
export interface BootstrapIdentity {
  /** Current identity status */
  status: IdentityStatus;

  /** User roles (e.g., ['USER']) */
  roles?: string[];

  /** Whether recovery is available (only present when status is SUSPENDED) */
  recoveryAvailable?: boolean;
}

/**
 * Minimal profile context for authenticated bootstrap.
 *
 * Contains only essential profile data for app initialization.
 * Full profile data should be fetched separately if needed.
 */
export interface BootstrapProfile {
  /** Profile ID */
  id: string;

  /** User's preferred locale (e.g., 'en', 'es') */
  locale: string;

  /** User's preferred timezone (e.g., 'UTC', 'America/New_York') */
  timezone: string;
}

/**
 * Authenticated bootstrap response for ACTIVE users.
 */
export interface ActiveBootstrapResponse {
  identity: {
    status: 'ACTIVE';
    roles: string[];
  };
  profile: BootstrapProfile | null;
}

/**
 * Authenticated bootstrap response for blocked users (BANNED/SUSPENDED/DELETED/PENDING_DELETION).
 */
export interface BlockedBootstrapResponse {
  identity: {
    status: 'BANNED' | 'SUSPENDED' | 'DELETED' | 'PENDING_RECOVERY' | 'PENDING_DELETION';
    recoveryAvailable?: boolean;
    /** For PENDING_DELETION: when final deletion will occur (end of grace period) */
    deletionScheduledAt?: string;
  };
}

/**
 * Union type for all possible authenticated bootstrap responses.
 */
export type AuthenticatedBootstrapResponse = ActiveBootstrapResponse | BlockedBootstrapResponse;
