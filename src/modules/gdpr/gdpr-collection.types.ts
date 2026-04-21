/**
 * GDPR Data Collection Types
 *
 * Defines the structure of collected user data for GDPR exports.
 * This is Phase 3 of the GDPR system - data collection WITHOUT export logic.
 *
 * Purpose:
 * - Define what data is collected
 * - Provide type safety for collectors
 * - Establish extension points for new data sources
 *
 * Design Principles:
 * - Plain JSON-serializable objects (no Prisma models)
 * - Domain-specific sections (profile, notifications, etc.)
 * - Metadata for audit trail (collection timestamp, etc.)
 * - NO export formatting (that's Phase 4)
 * - NO storage logic (that's Phase 4)
 */

// ─────────────────────────────────────────────────────────────
// Collected Data Structure
// ─────────────────────────────────────────────────────────────

/**
 * The complete structure of collected GDPR data for a user.
 *
 * This represents ALL user data that has been gathered from
 * registered GDPR tables. It does NOT include formatting,
 * file generation, or delivery logic.
 *
 * Extension Pattern:
 * To add new data sources:
 * 1. Register table in gdpr.registry.ts
 * 2. Create collector service
 * 3. Add property to this interface
 * 4. Add collector invocation in orchestrator
 */
export interface GdprCollectedData {
  /**
   * Metadata about the data collection process.
   */
  metadata: GdprCollectionMetadata;

  /**
   * User identity information.
   * This is the ownership anchor - all other data belongs to this identity.
   */
  identity: GdprIdentityData;

  /**
   * User profile data (display name, timestamps).
   */
  profile: GdprProfileData | null;

  /**
   * User notification history.
   */
  notifications: GdprNotificationData;

  /**
   * User notification preferences and delivery channels.
   */
  notificationPreferences: GdprNotificationPreferencesData | null;

  // Future extension points:
  // orders?: GdprOrderData[];
  // payments?: GdprPaymentData[];
  // messages?: GdprMessageData[];
}

/**
 * Metadata about the data collection operation itself.
 */
export interface GdprCollectionMetadata {
  /** Identity ID for which data was collected */
  identityId: string;

  /** When the data was collected */
  collectedAt: Date;

  /** Number of data sources collected */
  sourcesCollected: number;

  /** Names of data sources that were collected */
  sources: string[];

  /** Version of the collection schema (for future compatibility) */
  schemaVersion: string;
}

// ─────────────────────────────────────────────────────────────
// Domain-Specific Data Types
// ─────────────────────────────────────────────────────────────

/**
 * User identity data.
 *
 * This is the ownership anchor. All other data is owned by this identity.
 * Note: externalUserId is included for user recognition, but should never
 * be used as a foreign key in domain tables.
 */
export interface GdprIdentityData {
  /** Internal identity ID */
  id: string;

  /** External user ID (JWT sub) for user recognition */
  externalUserId: string;

  /** Whether the identity is flagged for review */
  isFlagged: boolean;

  /** Whether the identity is suspended */
  isSuspended: boolean;

  /** Last recorded activity timestamp */
  lastActivity: Date | null;

  /** When the identity was created */
  createdAt: Date;

  /** When the identity was last updated */
  updatedAt: Date;
}

/**
 * User profile data.
 */
export interface GdprProfileData {
  /** Profile ID */
  id: string;

  /** User's display name */
  displayName: string;

  /** User's preferred language (ISO 639-1 code, e.g., "en", "es") */
  language?: string;

  /** When the profile was created */
  createdAt: Date;

  /** When the profile was last updated */
  updatedAt: Date;
}

/**
 * User notification history and preferences.
 */
export interface GdprNotificationData {
  /** Total number of notifications */
  totalCount: number;

  /** Individual notification records */
  notifications: GdprNotificationRecord[];
}

/**
 * A single notification record.
 */
export interface GdprNotificationRecord {
  /** Notification ID */
  id: string;

  /** Notification type (e.g., 'GDPR_EXPORT_READY') */
  type: string;

  /** Notification title */
  title: string;

  /** Notification content/body */
  body: string;

  /** Whether the notification has been read */
  isRead: boolean;

  /** When the notification was created */
  createdAt: Date;

  /** When the notification was read (if applicable) */
  readAt: Date | null;
}

/**
 * Email channel data for GDPR export.
 */
export interface GdprEmailChannelData {
  /** Email address */
  email: string;

  /** Whether transactional notifications are enabled */
  enabled: boolean;

  /** Whether promotional notifications are enabled */
  promoEnabled: boolean;

  /** When the channel was created */
  createdAt: Date;
}

/**
 * Push channel data for GDPR export.
 */
export interface GdprPushChannelData {
  /** Platform (ios/android/unknown) */
  platform: string;

  /** Device identifier (for user recognition) */
  deviceKey: string;

  /**
   * Masked Expo push token (first 20 chars + last 4 chars).
   * Full token is masked for security - if leaked, could be used to send
   * unauthorized push notifications. GDPR requires disclosure of all data,
   * but masking is acceptable for security-sensitive identifiers.
   */
  expoTokenMasked: string;

  /** Whether this channel is active */
  isActive: boolean;

  /** When the channel was created */
  createdAt: Date;
}

/**
 * User notification preferences and delivery channels.
 */
export interface GdprNotificationPreferencesData {
  /** Notification profile ID */
  id: string;

  /** Active delivery channels (e.g., ['EMAIL', 'PUSH']) */
  channels: string[];

  /** Registered email addresses for notifications */
  emailChannels: GdprEmailChannelData[];

  /** Registered push notification devices */
  pushChannels: GdprPushChannelData[];

  /** When preferences were created */
  createdAt: Date;

  /** When preferences were last updated */
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────
// Collector Function Type
// ─────────────────────────────────────────────────────────────

/**
 * Function signature for data collectors.
 *
 * Each collector is responsible for gathering data from ONE bounded concern.
 * Collectors must:
 * - Accept identityId as input
 * - Return plain JSON-serializable data
 * - Handle their own error cases
 * - NOT perform side effects
 * - NOT know about export formats or storage
 *
 * @param identityId - The internal identity ID to collect data for
 * @returns The collected data for this domain
 */
export type GdprDataCollector<T> = (identityId: string) => Promise<T>;

// ─────────────────────────────────────────────────────────────
// Collection Result & Error Handling
// ─────────────────────────────────────────────────────────────

/**
 * Result of a data collection attempt for a single source.
 */
export interface GdprCollectionSourceResult {
  /** Name of the data source (e.g., 'profile', 'notifications') */
  source: string;

  /** Whether collection succeeded */
  success: boolean;

  /** Error message if collection failed */
  error?: string;

  /** How long collection took (milliseconds) */
  durationMs: number;
}

/**
 * Summary of the entire collection operation.
 */
export interface GdprCollectionSummary {
  /** Identity ID that was collected */
  identityId: string;

  /** Total number of sources attempted */
  totalSources: number;

  /** Number of sources that succeeded */
  successfulSources: number;

  /** Number of sources that failed */
  failedSources: number;

  /** Detailed results for each source */
  sourceResults: GdprCollectionSourceResult[];

  /** Total collection time (milliseconds) */
  totalDurationMs: number;

  /** Whether the overall collection succeeded (at least one source) */
  overallSuccess: boolean;
}
