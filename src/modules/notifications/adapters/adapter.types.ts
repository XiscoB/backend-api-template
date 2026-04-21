/**
 * Notification Adapter Types
 *
 * Shared types for notification delivery adapters.
 * Adapters are responsible for sending notifications to specific channels.
 *
 * Design principles:
 * - Adapters do NOT know about users
 * - Adapters do NOT know about GDPR or suspension
 * - Adapters do NOT know about delivery rules
 * - Adapters ONLY send payloads to targets
 */

import { NotificationCategory } from '../domain/notification-category';

/**
 * Payload for notification delivery.
 * This is the data passed to adapters for sending.
 */
export interface NotificationPayload {
  /** Title/subject of the notification */
  title: string;
  /** Body/content of the notification */
  body: string;
  /** Additional data for the notification (optional) */
  data?: Record<string, unknown>;
}

/**
 * Email-specific payload.
 * Extends base payload with email-specific fields.
 */
export interface EmailPayload extends NotificationPayload {
  /** HTML body (optional, falls back to plain text body) */
  htmlBody?: string;
}

/**
 * Push-specific payload.
 * Extends base payload with push-specific fields.
 */
export interface PushPayload extends NotificationPayload {
  /** Badge count to show on app icon (optional) */
  badge?: number;
  /** Sound to play (optional) */
  sound?: string;
  /** Category for actionable notifications (optional) - PROVIDER LEVEL ONLY */
  categoryId?: string;
}

/**
 * Result of a delivery attempt.
 * Strictly minimal for audit logging.
 */
export interface DeliveryResult {
  /** Target that was delivered to (email address, device token, etc.) */
  target: string;

  /**
   * Normalized status enum for the database log.
   * - SENT: Provider accepted the request (e.g. HTTP 200).
   * - FAILED: Provider rejected it or network failure.
   * - SKIPPED: Circuit breaker or internal logic prevented sending.
   */
  status: 'SENT' | 'FAILED' | 'SKIPPED';

  /**
   * Human-readable error message for audit.
   * NO stack traces, NO sensitive keys.
   */
  error?: string;
}

/**
 * Email adapter interface.
 *
 * Implementations send emails to a specific address.
 * The adapter does NOT know about users or preferences.
 */
export interface EmailAdapter {
  /**
   * Send an email to a specific address.
   *
   * @param email - Target email address
   * @param payload - Email content
   * @param category - Notification category (for potential provider-specific handling)
   * @returns Delivery result
   */
  send(
    email: string,
    payload: EmailPayload,
    category: NotificationCategory,
  ): Promise<DeliveryResult>;
}

/**
 * Push adapter interface.
 *
 * Implementations send push notifications to a specific device token.
 * The adapter does NOT know about users or preferences.
 */
export interface PushAdapter {
  /**
   * Send a push notification to a specific device.
   *
   * @param token - Device push token (opaque string)
   * @param payload - Push notification content
   * @returns Delivery result
   */
  send(token: string, payload: PushPayload): Promise<DeliveryResult>;
}

/**
 * Injection tokens for adapters.
 */
export const EMAIL_ADAPTER = Symbol('EMAIL_ADAPTER');
export const PUSH_ADAPTER = Symbol('PUSH_ADAPTER');
