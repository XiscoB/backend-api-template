/**
 * Recipient Group Types
 *
 * Centralized, closed enum of recipient groups.
 * Adding a new group requires a conscious change in this layer.
 *
 * @see RecipientGroupService
 */
export enum RecipientGroup {
  /**
   * Infrastructure alerts (scheduler, connectivity, background job failures)
   * Env: INFRA_ALERT_RECIPIENTS
   */
  INFRA_ALERTS = 'INFRA_ALERTS',

  /**
   * Platform reliability reports (scheduler health, error trends)
   * Env: PLATFORM_REPORT_RECIPIENTS
   */
  PLATFORM_REPORTS = 'PLATFORM_REPORTS',

  /**
   * Notification health reports (delivery stats, channel usage)
   * Env: NOTIFICATION_HEALTH_REPORT_RECIPIENTS
   */
  NOTIFICATION_HEALTH_REPORTS = 'NOTIFICATION_HEALTH_REPORTS',

  /**
   * Safety & moderation reports (report volume, resolution metrics)
   * Env: SAFETY_MODERATION_REPORT_RECIPIENTS
   */
  SAFETY_MODERATION_REPORTS = 'SAFETY_MODERATION_REPORTS',

  /**
   * GDPR compliance reports (request processing, integrity checks)
   * Env: GDPR_REPORT_RECIPIENTS
   */
  GDPR_REPORTS = 'GDPR_REPORTS',

  /**
   * Weekly growth/activity reports (user metrics, dormancy)
   * Env: WEEKLY_REPORT_RECIPIENTS
   */
  WEEKLY_REPORTS = 'WEEKLY_REPORTS',
}

/**
 * Alert severity levels.
 * Used for subject line formatting.
 */
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

/**
 * Result of an alert delivery attempt.
 */
export interface AlertDeliveryResult {
  sent: boolean;
  skippedReason?: 'no_recipients' | 'email_failed';
  recipientCount?: number;
}

/**
 * Result of a report delivery attempt.
 */
export interface ReportDeliveryResult {
  sent: boolean;
  skippedReason?: 'no_recipients' | 'email_failed';
  recipientCount?: number;
}
