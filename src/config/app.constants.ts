/**
 * Application Constants
 *
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                   CENTRAL CONFIGURATION FILE                                   ║
 * ║                                                                               ║
 * ║   This is the ONE file to customize when forking this template.              ║
 * ║   All hardcoded values, limits, and feature flags are centralized here.      ║
 * ║                                                                               ║
 * ║   MODIFICATION GUIDE:                                                         ║
 * ║   1. Update VERSION info when releasing                                       ║
 * ║   2. Toggle FEATURE_FLAGS for your deployment                                 ║
 * ║   3. Update BRANDING for your project identity                                ║
 * ║   4. Adjust GDPR_TABLES when adding new user-owned tables                     ║
 * ║   5. Tune limits/batch sizes based on your infrastructure                     ║
 * ║                                                                               ║
 * ║   NOTE: Environment-specific config (secrets, URLs) belongs in .env          ║
 * ║   This file is for version-controlled, non-secret configuration.             ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * @see .env.example for environment-specific configuration
 * @see src/config/app-config.validation.ts for env var validation
 */

// ═══════════════════════════════════════════════════════════════════════════════
// VERSIONING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Application version information.
 *
 * Used for:
 * - GDPR export schema versioning
 * - API version headers
 * - Health check responses
 * - Client compatibility checks
 */
export const VERSION = {
  /** Current application version */
  APP_VERSION: '0.1.0',

  /** Current policies version (terms of service, privacy policy) */
  POLICIES_VERSION: '1.0.0',

  /** GDPR export document schema version */
  GDPR_SCHEMA_VERSION: '1.0.0',

  /** Minimum compatible app versions by platform */
  COMPATIBLE_VERSIONS: {
    /** Minimum Android app version */
    ANDROID: ['0.1.0'],
    /** Minimum iOS app version */
    IOS: ['0.1.0'],
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE FLAGS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Feature flags for optional functionality.
 *
 * Toggle these to enable/disable features without code changes.
 * For A/B testing or gradual rollouts, use environment variables instead.
 */
export const FEATURE_FLAGS = {
  /** Enable premium/paid features */
  IS_PREMIUM_ENABLED: false,

  /** Enable debug logging (verbose output) */
  ACTIVATE_DEBUG_LOGS: false,

  /** Enable push notifications */
  IS_PUSH_ENABLED: true,

  /** Enable email notifications */
  IS_EMAIL_ENABLED: true,

  /** Enable GDPR data export feature */
  IS_GDPR_EXPORT_ENABLED: true,

  /** Enable account suspension (reversible deletion) */
  IS_SUSPENSION_ENABLED: true,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// BRANDING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Brand identity for exports and communications.
 *
 * Used in:
 * - GDPR export documents
 * - Email templates
 * - Push notification sender names
 */
export const BRANDING = {
  /** Company/app name displayed to users */
  COMPANY_NAME: 'Template-base',

  /** Path to logo asset (relative to public/) */
  LOGO_PATH: 'assets/branding/logo.png',

  /** Support email address */
  SUPPORT_EMAIL: 'support@example.com',

  /** No-reply email address */
  NOREPLY_EMAIL: 'noreply@example.com',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNATIONALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Language and localization settings.
 */
export const I18N = {
  /** Default language code */
  DEFAULT_LANGUAGE: 'en' as const,

  /** All supported language codes */
  SUPPORTED_LANGUAGES: ['en', 'es'] as const,

  /** Default locale for date/number formatting */
  DEFAULT_LOCALE: 'en-US',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// GDPR CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GDPR-related constants.
 *
 * Controls suspension lifecycle, deletion lifecycle, export behavior, and batch processing.
 */
export const GDPR = {
  // ─────────────────────────────────────────────────────────────────────────────
  // Suspension Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  /** Default grace period before auto-escalation to deletion (days) */
  DEFAULT_GRACE_PERIOD_DAYS: 30,

  /** Cooldown after recovery before new suspension can be requested (hours) */
  RECOVERY_COOLDOWN_HOURS: 24,

  /** Days before expiration to send warning notification */
  EXPIRATION_WARNING_DAYS: 7,

  // ─────────────────────────────────────────────────────────────────────────────
  // Deletion Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Grace period before final deletion (days).
   * During this period, user is blocked but data is not yet anonymized.
   * Can be overridden by GDPR_DELETION_GRACE_PERIOD_DAYS env var.
   */
  DELETION_GRACE_PERIOD_DAYS: 30,

  /**
   * Days before final deletion to send warning email.
   * Used to remind users that deletion is imminent.
   */
  DELETION_WARNING_DAYS: 7,

  /**
   * Whether deletion can be cancelled during grace period.
   * Set to false for strict terminal deletion (GDPR delete is irreversible).
   * NOTE: Deletion semantics are NOT feature-flagged. This must remain false.
   */
  DELETION_CANCELLATION_ALLOWED: false,

  // ─────────────────────────────────────────────────────────────────────────────
  // Batch Processing
  // ─────────────────────────────────────────────────────────────────────────────

  /** Batch size for processing expired suspensions */
  SUSPENSION_BATCH_SIZE: 10,

  /** Batch size for expiration warning notifications */
  WARNING_BATCH_SIZE: 100,

  /** Batch size for pending deletion processing */
  DELETION_BATCH_SIZE: 10,

  /** Batch size for export cleanup */
  EXPORT_CLEANUP_BATCH_SIZE: 100,

  /** Batch size for processing GDPR requests */
  REQUEST_BATCH_SIZE: 100,

  // ─────────────────────────────────────────────────────────────────────────────
  // Dynamic Export
  // ─────────────────────────────────────────────────────────────────────────────

  /** Default section order for tables without explicit order */
  DEFAULT_SECTION_ORDER: 100,
} as const;

/**
 * Tables included in GDPR operations (export, deletion, suspension).
 *
 * Every Prisma model with user-owned data MUST be listed here.
 * This is the authoritative list - the gdpr.registry.ts imports from here.
 *
 * Format: Prisma model names (PascalCase)
 *
 * @see src/modules/gdpr/gdpr.registry.ts for field-level configuration
 */
export const GDPR_INCLUDED_TABLES: readonly string[] = [
  // Core User Data
  'Profile',

  // Notification System
  'NotificationLog',
  'ScheduledNotification',
  'UserNotificationProfile',
  'UserEmailChannel',
  'UserPushChannel',
] as const;

/**
 * Tables explicitly excluded from GDPR user data operations.
 *
 * These are infrastructure tables required for GDPR compliance itself
 * or audit purposes. Data is deleted via CASCADE when Identity is deleted.
 *
 * Format: Prisma model names (PascalCase)
 */
export const GDPR_EXCLUDED_TABLES: readonly string[] = [
  // Core infrastructure (deleted last via CASCADE)
  'Identity',
  'Request',

  // Audit & compliance (legally required retention)
  'GdprAuditLog',

  // Suspension infrastructure
  'AccountSuspension',
  'SuspensionBackup',

  // Notification infrastructure
  'NotificationDeliveryLog',
  'NotificationEvent',
  'NotificationEventDelivery',
  'DeliveryRetryQueue',

  // Scheduler infrastructure
  'SchedulerLock',

  // GDPR export infrastructure
  'GdprExportFile',

  // GDPR deletion email infrastructure (write-once, delete-immediately)
  'GdprDeletionEmail',

  // Deletion legal hold infrastructure (blocks deletion ONLY, does NOT retain user data)
  'DeletionLegalHold',

  // Internal operational logs (NOT user data, NOT included in exports)
  'InternalLog',

  // Moderation data (involves multiple identities, contains third-party content)
  'Report',
] as const;

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Notification system constants.
 */
export const NOTIFICATIONS = {
  // ─────────────────────────────────────────────────────────────────────────────
  // Batch Processing
  // ─────────────────────────────────────────────────────────────────────────────

  /** Batch size for cron notification processing */
  CRON_BATCH_SIZE: 100,

  /** Batch size for Expo push API calls */
  EXPO_BATCH_SIZE: 100,

  /** Batch size for retry queue processing */
  RETRY_BATCH_SIZE: 50,

  /** Batch size for scheduled notification processing */
  SCHEDULED_BATCH_SIZE: 100,

  // ─────────────────────────────────────────────────────────────────────────────
  // Validation Limits
  // ─────────────────────────────────────────────────────────────────────────────

  /** Maximum push token length */
  PUSH_TOKEN_MAX_LENGTH: 500,

  /** Maximum unique key length */
  UNIQUE_KEY_MAX_LENGTH: 200,

  /** Maximum platform string length */
  PLATFORM_MAX_LENGTH: 50,

  /** Maximum language code length */
  LANGUAGE_MAX_LENGTH: 10,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * User profile validation constants.
 */
export const PROFILE = {
  /** Minimum display name length */
  DISPLAY_NAME_MIN_LENGTH: 2,

  /** Maximum display name length */
  DISPLAY_NAME_MAX_LENGTH: 100,

  /** Default language for new profiles */
  DEFAULT_LANGUAGE: 'en',
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// API CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * API pagination and limits.
 */
export const API = {
  /** Default page size for list endpoints */
  DEFAULT_PAGE_SIZE: 50,

  /** Maximum allowed page size */
  MAX_PAGE_SIZE: 100,

  /** Default page size for admin endpoints */
  ADMIN_PAGE_SIZE: 50,

  /** Default limit for audit log queries */
  AUDIT_LOG_LIMIT: 100,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULER CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Background job scheduler constants.
 */
export const SCHEDULER = {
  /** Lock TTL for distributed job locking (milliseconds) */
  DEFAULT_LOCK_TTL_MS: 5 * 60 * 1000, // 5 minutes
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL OPERATIONAL LOGS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Internal operational logging constants.
 *
 * ⚠️ THIS IS NOT:
 * - Analytics or metrics (use external observability tools)
 * - User activity tracking (privacy violation)
 * - Audit logs (use GdprAuditLog for compliance)
 * - Business event logs (wrong system)
 *
 * Purpose:
 * - Internal operational diagnostics only
 * - Time-bounded retention (auto-deleted)
 * - Platform stability monitoring
 *
 * Legal basis: Legitimate interest (platform stability)
 *
 * @see docs/INTERNAL_OPERATIONAL_LOGS.md
 */
export const INTERNAL_LOGS = {
  /**
   * Default retention period in days.
   * Logs older than this are automatically deleted.
   * Can be overridden by INTERNAL_LOG_RETENTION_DAYS env var.
   */
  DEFAULT_RETENTION_DAYS: 14,

  /** Batch size for cleanup operations */
  CLEANUP_BATCH_SIZE: 1000,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// TESTING CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Testing mode constants.
 *
 * ⚠️ IMPORTANT: This constant is used as a DEFAULT VALUE only.
 *
 * To enable/disable scenario testing, set SCENARIO_TESTING in environment.
 * Recommended default is false.
 *
 * The constant below is read by app-config.service.ts only as fallback when
 * SCENARIO_TESTING env var is not set.
 *
 * Used by automated test scripts (scenario tests, E2E tests).
 * The scenario test runner (scripts/dev/scenarios/run-scenarios.js) sets env explicitly.
 */
export const TESTING = {
  /**
   * Default for scenario testing mode (static test JWT keys).
   */
  SCENARIO_TESTING_ENABLED: false,
} as const;

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLIDATED EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All application constants in a single namespace.
 *
 * Usage:
 * ```typescript
 * import { APP_CONSTANTS } from '@/config/app.constants';
 *
 * console.log(APP_CONSTANTS.VERSION.APP_VERSION);
 * console.log(APP_CONSTANTS.GDPR.DEFAULT_GRACE_PERIOD_DAYS);
 * console.log(APP_CONSTANTS.BRANDING.COMPANY_NAME);
 * ```
 */
export const APP_CONSTANTS = {
  VERSION,
  FEATURE_FLAGS,
  BRANDING,
  I18N,
  GDPR,
  GDPR_INCLUDED_TABLES,
  GDPR_EXCLUDED_TABLES,
  NOTIFICATIONS,
  PROFILE,
  API,
  SCHEDULER,
  INTERNAL_LOGS,
  TESTING,
} as const;
