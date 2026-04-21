/**
 * Notification Category
 *
 * Defines the semantic categories of notifications.
 * Categories determine delivery eligibility based on user state.
 *
 * Important:
 * - Categories are about WHAT is being sent, not HOW
 * - Delivery rules use categories to decide if sending is allowed
 * - Categories should not be added without explicit approval
 */
export enum NotificationCategory {
  /**
   * System notifications.
   * Examples: Password reset, security alerts, account activity.
   * Delivered to ACTIVE users only.
   */
  SYSTEM = 'SYSTEM',

  /**
   * Legal notifications.
   * Examples: Terms of service updates, GDPR-related communications.
   * Delivered to ACTIVE and SUSPENDED users.
   * Required by law - cannot be disabled by user preferences.
   */
  LEGAL = 'LEGAL',

  /**
   * Promotional notifications.
   * Examples: Marketing, offers, newsletters.
   * Delivered to ACTIVE users only, respects promo_enabled preference.
   */
  PROMO = 'PROMO',
}
