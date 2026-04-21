/**
 * GDPR Types
 *
 * Minimal type definitions for GDPR-related operations.
 * Product-specific types should be defined in extending modules.
 */

import { GDPR } from '../../config/app.constants';

/**
 * Enforcement violation - model with identityId not in registry.
 */
export interface GdprEnforcementViolation {
  modelName: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────
// Suspension Lifecycle Types
// ─────────────────────────────────────────────────────────────

/**
 * Suspension lifecycle states.
 *
 * Mental Model:
 * - ACTIVE: Normal account (no active suspension)
 * - SUSPENDING: Suspension in progress, recovery NOT allowed
 * - SUSPENDED: Data anonymized, backup exists, recovery possible
 * - RECOVERED: Restored from backup, re-activated
 * - EXPIRED: Backup deleted, recovery impossible, equivalent to permanent deletion
 *
 * CRITICAL: Suspension = reversible deletion.
 * A suspended account MUST behave exactly like a deleted account.
 */
export type SuspensionLifecycleState =
  | 'ACTIVE'
  | 'SUSPENDING'
  | 'SUSPENDED'
  | 'RECOVERED'
  | 'EXPIRED';

/**
 * Recovery preconditions that must ALL be true for recovery to proceed.
 */
export interface RecoveryPreconditions {
  /** Backup exists for the suspension */
  backupExists: boolean;
  /** Backup has not been used (consumed) */
  backupNotUsed: boolean;
  /** Current time is before suspendedUntil deadline */
  withinRecoveryWindow: boolean;
  /** Account is marked as suspended (not recovered/expired) */
  accountIsSuspended: boolean;
  /** Suspension has not expired */
  notExpired: boolean;
  /** Cooldown period since last recovery has passed */
  cooldownPassed: boolean;
}

/**
 * Result of recovery precondition check.
 */
export interface RecoveryValidationResult {
  valid: boolean;
  preconditions: RecoveryPreconditions;
  failedConditions: (keyof RecoveryPreconditions)[];
}

// ─────────────────────────────────────────────────────────────
// Suspension Types
// ─────────────────────────────────────────────────────────────

/**
 * Summary of suspension operation on a single table.
 */
export interface TableSuspensionSummary {
  table: string;
  strategy: 'ANONYMIZE';
  rows: number;
  backedUp: boolean;
}

/**
 * Result of a GDPR suspension operation.
 */
export interface GdprSuspensionResult {
  identityId: string;
  suspensionUid: string;
  anonymizedUid: string;
  suspendedAt: Date;
  suspendedUntil: Date | null;
  lifecycleState: SuspensionLifecycleState;
  summary: TableSuspensionSummary[];
  totalRowsAffected: number;
}

/**
 * Summary of recovery operation on a single table.
 */
export interface TableRecoverySummary {
  table: string;
  rows: number;
  restored: boolean;
}

/**
 * Result of a GDPR recovery operation.
 */
export interface GdprRecoveryResult {
  identityId: string;
  suspensionUid: string;
  recoveredAt: Date;
  summary: TableRecoverySummary[];
  totalRowsRestored: number;
}

// ─────────────────────────────────────────────────────────────
// Suspension Hooks
// ─────────────────────────────────────────────────────────────

/**
 * Optional hook for suspension operations.
 *
 * This interface is provided for future extension. The base suspension
 * system emits hooks but does NOT implement business logic.
 *
 * Usage (in extending projects):
 * ```typescript
 * @Injectable()
 * export class AuthSuspensionHook implements GdprSuspensionHook {
 *   async onSuspend(userId: string): Promise<void> {
 *     // Revoke auth tokens, block login, etc.
 *   }
 *
 *   async onResume(userId: string): Promise<void> {
 *     // Re-enable auth, allow login, etc.
 *   }
 * }
 * ```
 *
 * Hook registration (in extending projects):
 * ```typescript
 * @Module({
 *   providers: [
 *     { provide: GDPR_SUSPENSION_HOOKS, useClass: AuthSuspensionHook, multi: true },
 *   ],
 * })
 * export class AuthModule {}
 * ```
 */
export interface GdprSuspensionHook {
  /**
   * Called after a user's account is suspended.
   *
   * @param identityId - The suspended user's identity ID
   * @returns Promise that resolves when hook completes (failures are logged, not thrown)
   */
  onSuspend(identityId: string): Promise<void>;

  /**
   * Called after a user's account is resumed.
   *
   * @param identityId - The resumed user's identity ID
   * @returns Promise that resolves when hook completes (failures are logged, not thrown)
   */
  onResume(identityId: string): Promise<void>;
}

/**
 * Injection token for suspension hooks.
 *
 * Use with @Inject(GDPR_SUSPENSION_HOOKS) to get all registered hooks.
 */
export const GDPR_SUSPENSION_HOOKS = Symbol('GDPR_SUSPENSION_HOOKS');

// ─────────────────────────────────────────────────────────────
// Suspension Configuration
// ─────────────────────────────────────────────────────────────

/**
 * Configuration options for suspension operations.
 */
export interface SuspensionConfig {
  /**
   * Default grace period before auto-escalation to deletion (in days).
   * If null, no automatic escalation occurs.
   */
  defaultGracePeriodDays?: number | null;

  /**
   * Cooldown period after recovery before a new suspension can be requested (in hours).
   * Default: 24 hours.
   */
  recoveryCooldownHours?: number;

  /**
   * Days before expiration to send warning notification.
   * Default: 7 days.
   */
  expirationWarningDays?: number;
}

/**
 * Default suspension configuration.
 * Sources values from centralized app.constants.ts
 */
export const DEFAULT_SUSPENSION_CONFIG: SuspensionConfig = {
  defaultGracePeriodDays: GDPR.DEFAULT_GRACE_PERIOD_DAYS,
  recoveryCooldownHours: GDPR.RECOVERY_COOLDOWN_HOURS,
  expirationWarningDays: GDPR.EXPIRATION_WARNING_DAYS,
};

// ─────────────────────────────────────────────────────────────
// Expiration Types
// ─────────────────────────────────────────────────────────────

/**
 * Result of a suspension expiration (finalization) operation.
 */
export interface GdprExpirationResult {
  suspensionUid: string;
  identityId: string;
  expiredAt: Date;
  backupsDeleted: number;
  legalRetentionRecordCreated: boolean;
}
