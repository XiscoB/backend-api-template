/**
 * Notifications Types
 *
 * Type definitions for the notification infrastructure.
 * This is a platform primitive, not a feature.
 *
 * Key principles:
 * - Types are opaque (string/JSON) - no domain-specific interpretation
 * - Payload structure is defined by consumers, not the base
 * - All types support GDPR operations
 * - Ownership flows through identityId
 */

import type { NotificationLog } from '@prisma/client';

// ─────────────────────────────────────────────────────────────
// Re-export Prisma types for convenience
// ─────────────────────────────────────────────────────────────

export {
  ScheduledNotificationStatus,
  NotificationChannelType,
  NotificationDeliveryStatus,
} from '@prisma/client';
export type { NotificationLog, ScheduledNotification } from '@prisma/client';
export type { NotificationPayload, EmailPayload, PushPayload } from './adapters/adapter.types';

// ─────────────────────────────────────────────────────────────
// Input Types
// ─────────────────────────────────────────────────────────────

/**
 * Input for creating an immediate notification.
 *
 * Creates a NotificationLog directly (no scheduling).
 * Use for notifications that should be visible immediately.
 *
 * NOTE: Uses identityId for persistence. externalUserId resolution
 * happens at the service layer boundary.
 */
export interface CreateImmediateNotificationInput {
  /** The identity who should see this notification */
  identityId: string;
  /** Notification type - semantic only, interpreted by consumers */
  type: string;
  /** Opaque JSON payload - interpreted by consumers */
  payload: Record<string, unknown>;
  /** Optional: The actor identity who triggered this notification */
  actorId?: string;
  /** When the notification becomes visible (defaults to now) */
  visibleAt?: Date;
}

/**
 * Input for creating a scheduled notification.
 *
 * Creates a ScheduledNotification that will be processed by cron.
 * Use for deferred notifications (e.g., reminders, delayed alerts).
 *
 * NOTE: Uses identityId for persistence. externalUserId resolution
 * happens at the service layer boundary.
 */
export interface CreateScheduledNotificationInput {
  /** The identity who should receive this notification */
  identityId: string;
  /** Notification type - semantic only */
  type: string;
  /** Opaque JSON payload */
  payload: Record<string, unknown>;
  /** Optional: The actor identity who triggered this notification */
  actorId?: string;
  /** When this notification should be processed and become visible */
  scheduledAt: Date;
}

// ─────────────────────────────────────────────────────────────
// Query Types
// ─────────────────────────────────────────────────────────────

/**
 * Filters for querying notification logs.
 */
export interface NotificationLogFilters {
  /** Only return notifications visible before this date */
  visibleBefore?: Date;
  /** Only return unread notifications */
  unreadOnly?: boolean;
  /** Include soft-deleted notifications */
  includeDeleted?: boolean;
  /** Filter by notification type */
  type?: string;
}

/**
 * Pagination options for list queries.
 */
export interface PaginationOptions {
  /** Number of items to skip */
  skip?: number;
  /** Maximum number of items to return */
  take?: number;
}

// ─────────────────────────────────────────────────────────────
// Cron Processing Types
// ─────────────────────────────────────────────────────────────

/**
 * Result of a single scheduled notification execution.
 */
export interface ScheduledNotificationExecutionResult {
  scheduledNotificationId: string;
  success: boolean;
  notificationLogId?: string;
  error?: string;
  /** Reason notification was skipped (e.g., identity deleted). Present when success=true but no execution occurred. */
  skippedReason?: string;
}

/**
 * Result of a cron processing run.
 */
export interface NotificationCronResult {
  /** Number of notifications processed (success + failure) */
  processed: number;
  /** Number of successfully executed notifications */
  succeeded: number;
  /** Number of failed notifications */
  failed: number;
  /** Total duration in milliseconds */
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────
// Delivery Hook Interface
// ─────────────────────────────────────────────────────────────

/**
 * Optional hook for notification delivery adapters.
 *
 * This interface is provided for future extension. The base notification
 * system emits notifications but NEVER delivers them. Delivery adapters
 * (email, push, SMS, etc.) should implement this interface.
 *
 * The hook is called AFTER the NotificationLog is created.
 * Delivery failures do NOT affect the NotificationLog (it remains as source of truth).
 *
 * Usage (in extending projects):
 * ```typescript
 * @Injectable()
 * export class EmailNotificationHook implements NotificationDeliveryHook {
 *   async onNotificationCreated(notification: NotificationLog): Promise<void> {
 *     // Send email based on notification.type and notification.payload
 *   }
 * }
 * ```
 *
 * Hook registration (in extending projects):
 * ```typescript
 * @Module({
 *   providers: [
 *     { provide: NOTIFICATION_DELIVERY_HOOKS, useClass: EmailNotificationHook, multi: true },
 *   ],
 * })
 * export class EmailNotificationsModule {}
 * ```
 */
export interface NotificationDeliveryHook {
  /**
   * Called after a notification is created and visible to the user.
   *
   * @param notification - The created notification log
   * @returns Promise that resolves when delivery is complete (or fails silently)
   */
  onNotificationCreated(notification: NotificationLog): Promise<void>;
}

/**
 * Injection token for notification delivery hooks.
 *
 * Use with @Inject(NOTIFICATION_DELIVERY_HOOKS) to get all registered hooks.
 */
export const NOTIFICATION_DELIVERY_HOOKS = Symbol('NOTIFICATION_DELIVERY_HOOKS');
