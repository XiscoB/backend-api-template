/**
 * Delivery Rules
 *
 * Central place for notification delivery eligibility logic.
 * This module answers: "Is this user allowed to receive this notification category?"
 *
 * Rules:
 * - DELETED users: No notifications allowed
 * - SUSPENDED users: Only LEGAL notifications allowed
 * - ACTIVE users: All notification categories allowed
 *
 * Important:
 * - This is the ONLY place where delivery eligibility is determined
 * - Do not duplicate this logic elsewhere
 * - Category-based rules, not channel-based
 */

import { NotificationCategory } from './notification-category';

/**
 * User state for delivery rule evaluation.
 * Maps to account suspension/deletion state.
 */
export enum UserState {
  /** User is active and can receive all notifications */
  ACTIVE = 'ACTIVE',
  /** User is suspended (GDPR restriction) - only LEGAL allowed */
  SUSPENDED = 'SUSPENDED',
  /** User is deleted - no notifications allowed */
  DELETED = 'DELETED',
}

/**
 * Result of delivery eligibility check.
 */
export interface DeliveryEligibilityResult {
  /** Whether delivery is allowed */
  allowed: boolean;
  /** Reason for the decision (for logging/debugging) */
  reason: string;
}

/**
 * Check if a notification can be delivered to a user.
 *
 * This is the single source of truth for delivery eligibility.
 *
 * @param userState - Current state of the user
 * @param category - Category of notification being sent
 * @returns Eligibility result with reason
 */
export function isDeliveryAllowed(
  userState: UserState,
  category: NotificationCategory,
): DeliveryEligibilityResult {
  // DELETED users receive nothing
  if (userState === UserState.DELETED) {
    return {
      allowed: false,
      reason: 'User is deleted - no notifications allowed',
    };
  }

  // SUSPENDED users can only receive LEGAL notifications
  if (userState === UserState.SUSPENDED) {
    if (category === NotificationCategory.LEGAL) {
      return {
        allowed: true,
        reason: 'Legal notifications are allowed for suspended users',
      };
    }
    return {
      allowed: false,
      reason: `Category ${category} is not allowed for suspended users`,
    };
  }

  // ACTIVE users can receive all categories
  if (userState === UserState.ACTIVE) {
    return {
      allowed: true,
      reason: 'User is active - all notifications allowed',
    };
  }

  // Fallback: Unknown state - deny for safety
  return {
    allowed: false,
    reason: `Unknown user state: ${userState as string}`,
  };
}
