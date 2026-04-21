/**
 * GDPR Registry
 *
 * This file declares which tables contain user data subject to GDPR.
 * Every Prisma model with an `identityId` column MUST be registered here.
 *
 * Architecture:
 * - GDPR_EXPORT_TABLES: Defines scope (which tables are user-owned)
 * - GDPR_ANONYMIZE_OVERRIDES: Exceptions that need ANONYMIZE instead of DELETE
 *
 * Principle:
 * - GDPR Export defines scope
 * - DELETE is the default behavior (no config needed)
 * - ANONYMIZE is an explicit override (requires piiFields)
 *
 * To add a new user-owned table:
 * 1. Add model name to GDPR_INCLUDED_TABLES in src/config/app.constants.ts
 * 2. Add field-level configuration to GDPR_EXPORT_TABLES below
 * 3. If it needs ANONYMIZE, add it to GDPR_ANONYMIZE_OVERRIDES (rare)
 * 4. That's it - DELETE is automatic
 *
 * @see src/config/app.constants.ts for table lists (GDPR_INCLUDED_TABLES, GDPR_EXCLUDED_TABLES)
 * @see docs/create_tables_guideline.md for Identity ownership rules
 * @see agents.md for GDPR implementation requirements
 */

import { Prisma } from '@prisma/client';
import {
  GDPR_EXCLUDED_TABLES as APP_EXCLUDED_TABLES,
  GDPR_INCLUDED_TABLES,
} from '../../config/app.constants';

// ─────────────────────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────────────────────

/**
 * Strategy for GDPR operations (delete, suspend).
 *
 * DELETE (default): Remove rows entirely
 * ANONYMIZE (explicit): Replace PII fields with placeholders
 */
export type GdprStrategy = 'DELETE' | 'ANONYMIZE';

/**
 * Replacement strategy for ANONYMIZE operations.
 *
 * NULL: Replace with null (if field is nullable)
 * RANDOM: Replace with random value
 * FIXED: Replace with fixed placeholder value (default)
 */
export type GdprReplacementStrategy = 'NULL' | 'RANDOM' | 'FIXED';

// ─────────────────────────────────────────────────────────────
// Layer 1: Export Scope (Authoritative)
// ─────────────────────────────────────────────────────────────

/**
 * Field type for GDPR export formatting.
 */
export type GdprFieldType = 'string' | 'date' | 'boolean' | 'number' | 'email' | 'masked' | 'json';

/**
 * Field definition for dynamic GDPR exports.
 *
 * When specified, the dynamic collector and document builder will:
 * 1. Query only these fields from the database
 * 2. Format them according to their type
 * 3. Use the provided labels/explanations in the export
 */
export interface GdprExportFieldDef {
  /** Prisma field name */
  field: string;

  /** Human-readable label (supports i18n key or literal) */
  label: string;

  /** Explanation for the user (what this data means/why we have it) */
  explanation: string;

  /** Field type for formatting */
  type: GdprFieldType;

  /**
   * For 'masked' type: how many chars to show at start/end.
   * @default { showStart: 15, showEnd: 4 }
   */
  maskConfig?: { showStart: number; showEnd: number };

  /**
   * Whether to include in export.
   * @default true
   */
  include?: boolean;
}

/**
 * Suspension risk level for immediate vs deferred processing.
 *
 * IMMEDIATE: Back up and DELETE at suspension request time (T+0)
 * DEFERRED: Process during cron (default)
 *
 * IMMEDIATE tables are intentionally small and explicit.
 * Adding a table to IMMEDIATE is a deliberate design decision.
 *
 * Note: IMMEDIATE-risk deletion is about behavioral safety, not completeness.
 * Full anonymization is always handled by cron.
 */
export type SuspensionRiskLevel = 'IMMEDIATE' | 'DEFERRED';

/**
 * Minimal definition of a user-owned table.
 *
 * This is the ONLY thing you need to declare for most tables.
 * DELETE behavior is automatic.
 */
export interface GdprExportTableDef {
  /**
   * The Prisma model name (PascalCase, as used in prisma.modelName).
   */
  modelName: string;

  /**
   * The database table name (snake_case, as mapped in Prisma schema).
   */
  tableName: string;

  /**
   * The Prisma field name used to identify the owner.
   * Typically 'identityId' for tables that reference Identity directly.
   */
  userField: string;

  /**
   * Whether to include in GDPR data export.
   * Set to false for execution-layer tables (e.g., scheduled jobs).
   */
  export: boolean;

  /**
   * Optional description for documentation.
   */
  description?: string;

  // ─────────────────────────────────────────────────────────────
  // Dynamic Export Configuration (Optional)
  // ─────────────────────────────────────────────────────────────
  // When exportFields is specified, the dynamic collector will:
  // 1. Query only these fields (plus id and timestamps)
  // 2. Format values according to field type
  // 3. Use labels/explanations in the export document
  //
  // When not specified, legacy collectors are used.
  // ─────────────────────────────────────────────────────────────

  /**
   * Fields to include in GDPR export.
   * If not specified, legacy collector is used.
   */
  exportFields?: GdprExportFieldDef[];

  /**
   * Section name for grouping in the export document.
   * Tables with same section are grouped together.
   * @example 'profile', 'notifications', 'preferences'
   */
  section?: string;

  /**
   * Section display order (lower = first).
   */
  sectionOrder?: number;

  /**
   * For nested tables: the parent table's model name.
   * Data will be fetched via relation instead of direct identityId query.
   * @example UserEmailChannel has parent: 'UserNotificationProfile'
   */
  parentModel?: string;

  /**
   * The relation path from parent to this table.
   * @example 'emailChannels' for UserNotificationProfile.emailChannels
   */
  parentRelation?: string;

  // ─────────────────────────────────────────────────────────────
  // Suspension Risk Configuration
  // ─────────────────────────────────────────────────────────────

  /**
   * Suspension risk level.
   * IMMEDIATE = backed up and DELETED at request time (T+0)
   * DEFERRED = processed by cron (default)
   *
   * @default 'DEFERRED'
   */
  suspensionRisk?: SuspensionRiskLevel;
}

/**
 * GDPR Export Tables - The Single Source of Truth
 *
 * Every table containing user data must be listed here.
 * This list defines the scope for:
 * - GDPR data exports
 * - GDPR suspension (backup + delete/anonymize)
 * - GDPR recovery
 * - GDPR deletion
 *
 * DEFAULT BEHAVIOR: All tables are backed up and DELETED during suspension.
 * To override with ANONYMIZE, add to GDPR_ANONYMIZE_OVERRIDES.
 */
export const GDPR_EXPORT_TABLES: readonly GdprExportTableDef[] = [
  // ─────────────────────────────────────────────────────────────
  // Core User Data
  // ─────────────────────────────────────────────────────────────
  {
    modelName: 'Profile',
    tableName: 'profiles',
    userField: 'identityId',
    export: true,
    description: 'User profile data',
    section: 'profile',
    sectionOrder: 10,
    exportFields: [
      {
        field: 'displayName',
        label: 'Display Name',
        explanation: 'The name you chose to display to others',
        type: 'string',
      },
      {
        field: 'language',
        label: 'Language Preference',
        explanation: 'Your preferred language for notifications and emails',
        type: 'string',
      },
      {
        field: 'createdAt',
        label: 'Profile Created',
        explanation: 'When your profile was first created',
        type: 'date',
      },
      {
        field: 'updatedAt',
        label: 'Last Updated',
        explanation: 'When your profile was last modified',
        type: 'date',
      },
    ],
  },
  // ─────────────────────────────────────────────────────────────
  // Notification System
  // ─────────────────────────────────────────────────────────────
  {
    modelName: 'NotificationLog',
    tableName: 'notification_logs',
    userField: 'identityId',
    export: true,
    description: 'User-visible notifications',
    section: 'notifications',
    sectionOrder: 20,
    exportFields: [
      {
        field: 'type',
        label: 'Notification Type',
        explanation: 'The type of notification event',
        type: 'string',
      },
      {
        field: 'payload',
        label: 'Notification Data',
        explanation: 'The notification details (title, message, etc.)',
        type: 'json',
      },
      {
        field: 'visibleAt',
        label: 'Visible At',
        explanation: 'When the notification became visible',
        type: 'date',
      },
      {
        field: 'readAt',
        label: 'Read At',
        explanation: 'When you read this notification (if applicable)',
        type: 'date',
      },
      {
        field: 'createdAt',
        label: 'Sent At',
        explanation: 'When the notification was sent',
        type: 'date',
      },
    ],
  },
  {
    modelName: 'ScheduledNotification',
    tableName: 'scheduled_notifications',
    userField: 'identityId',
    export: false, // Execution layer, not user-visible
    description: 'Scheduled notifications (execution layer)',
    suspensionRisk: 'IMMEDIATE', // Can trigger future outbound effects
  },
  {
    modelName: 'UserNotificationProfile',
    tableName: 'user_notification_profile',
    userField: 'identityId',
    export: true,
    description: 'User notification preferences',
    section: 'preferences',
    sectionOrder: 30,
    exportFields: [
      {
        field: 'id',
        label: 'Preferences ID',
        explanation: 'Your unique notification preferences identifier',
        type: 'string',
      },
      {
        field: 'createdAt',
        label: 'Preferences Created',
        explanation: 'When your notification preferences were set up',
        type: 'date',
      },
      {
        field: 'updatedAt',
        label: 'Last Updated',
        explanation: 'When your preferences were last modified',
        type: 'date',
      },
    ],
    suspensionRisk: 'IMMEDIATE', // Causes outbound side effects
  },
  {
    modelName: 'UserEmailChannel',
    tableName: 'user_email_channel',
    userField: 'notificationProfileId', // References profile, not identity
    export: true,
    description: 'User email delivery channels',
    section: 'preferences',
    sectionOrder: 31,
    parentModel: 'UserNotificationProfile',
    parentRelation: 'emailChannels',
    exportFields: [
      {
        field: 'email',
        label: 'Email Address',
        explanation: 'Your registered email address for notifications',
        type: 'email',
      },
      {
        field: 'enabled',
        label: 'Email Notifications',
        explanation: 'Whether you receive transactional notifications at this email',
        type: 'boolean',
      },
      {
        field: 'promoEnabled',
        label: 'Marketing Emails',
        explanation: 'Whether you receive promotional/marketing emails at this address',
        type: 'boolean',
      },
      {
        field: 'createdAt',
        label: 'Registered On',
        explanation: 'When this email was registered',
        type: 'date',
      },
    ],
    suspensionRisk: 'IMMEDIATE', // Contains delivery tokens
  },
  {
    modelName: 'UserPushChannel',
    tableName: 'user_push_channel',
    userField: 'notificationProfileId', // References profile, not identity
    export: true,
    description: 'User push notification channels',
    section: 'preferences',
    sectionOrder: 32,
    parentModel: 'UserNotificationProfile',
    parentRelation: 'pushChannels',
    exportFields: [
      {
        field: 'platform',
        label: 'Device Platform',
        explanation: 'The type of device registered for push notifications (iOS/Android)',
        type: 'string',
      },
      {
        field: 'uniqueKey',
        label: 'Device Identifier',
        explanation: 'A unique identifier for this device (not your device serial number)',
        type: 'string',
      },
      {
        field: 'expoToken',
        label: 'Push Token',
        explanation:
          'Your push notification token (masked for security). Used to deliver notifications to your device.',
        type: 'masked',
        maskConfig: { showStart: 15, showEnd: 4 },
      },
      {
        field: 'isActive',
        label: 'Push Active',
        explanation: 'Whether push notifications are currently active for this device',
        type: 'boolean',
      },
      {
        field: 'createdAt',
        label: 'Registered On',
        explanation: 'When this device was registered for push notifications',
        type: 'date',
      },
    ],
    suspensionRisk: 'IMMEDIATE', // Contains push tokens
  },
] as const;

// ─────────────────────────────────────────────────────────────
// Layer 2: ANONYMIZE Overrides (Exceptions Only)
// ─────────────────────────────────────────────────────────────

/**
 * Override configuration for tables that need ANONYMIZE instead of DELETE.
 *
 * IMPORTANT: Most tables should NOT be listed here.
 * Only add a table if it MUST keep its row structure during suspension.
 */
export interface GdprAnonymizeOverride {
  /**
   * Fields containing PII to anonymize.
   * REQUIRED - ANONYMIZE without piiFields is invalid.
   */
  piiFields: string[];

  /**
   * How to replace field values. Defaults to 'FIXED'.
   */
  replacement?: GdprReplacementStrategy;
}

/**
 * ANONYMIZE Overrides - Exceptions to DELETE-by-default
 *
 * Only tables that MUST keep their row structure during suspension.
 * Common reasons:
 * - Foreign key integrity (other tables reference this one)
 * - App-level assumptions about row existence
 *
 * If a table is not listed here, it uses DELETE (backup + remove rows).
 */
export const GDPR_ANONYMIZE_OVERRIDES: Readonly<Record<string, GdprAnonymizeOverride>> = {
  // Profile must keep row structure for potential FK references
  Profile: {
    piiFields: ['displayName'],
    replacement: 'FIXED',
  },
} as const;

// ─────────────────────────────────────────────────────────────
// Infrastructure Tables (Excluded from GDPR)
// ─────────────────────────────────────────────────────────────

/**
 * Tables explicitly excluded from GDPR operations.
 *
 * These are infrastructure tables required for GDPR compliance itself
 * or audit purposes. Data is deleted via CASCADE when Identity is deleted.
 *
 * @see src/config/app.constants.ts - GDPR_EXCLUDED_TABLES is the source of truth
 */
export const GDPR_EXCLUDED_TABLES: readonly string[] = APP_EXCLUDED_TABLES;

// ─────────────────────────────────────────────────────────────
// Composed Types (Runtime)
// ─────────────────────────────────────────────────────────────

/**
 * @deprecated Use GdprStrategy instead
 */
export type GdprDeleteStrategy = GdprStrategy;

/**
 * @deprecated Use GdprStrategy instead
 */
export type GdprSuspendStrategy = GdprStrategy;

/**
 * Configuration for GDPR deletion behavior.
 * Composed at runtime from GDPR_EXPORT_TABLES + GDPR_ANONYMIZE_OVERRIDES.
 */
export interface GdprDeleteConfig {
  strategy: GdprStrategy;
  fields?: string[];
  replacement?: GdprReplacementStrategy;
}

/**
 * Configuration for GDPR suspension behavior.
 * Composed at runtime from GDPR_EXPORT_TABLES + GDPR_ANONYMIZE_OVERRIDES.
 */
export interface GdprSuspendConfig {
  strategy: GdprStrategy;
  backup: true;
  piiFields?: string[];
  replacement?: GdprReplacementStrategy;
}

/**
 * Full configuration for a GDPR-registered table.
 * This is the composed runtime type used by services.
 */
export interface GdprTableConfig {
  modelName: string;
  tableName: string;
  userField: string;
  export: boolean;
  delete: GdprDeleteConfig;
  suspend: GdprSuspendConfig;
  description?: string;
}

// ─────────────────────────────────────────────────────────────
// Runtime Composition
// ─────────────────────────────────────────────────────────────

/**
 * Compose a full GdprTableConfig from export table + optional override.
 * This is the core composition logic.
 */
function composeTableConfig(table: GdprExportTableDef): GdprTableConfig {
  const override = GDPR_ANONYMIZE_OVERRIDES[table.modelName];

  if (override) {
    // ANONYMIZE override exists
    return {
      modelName: table.modelName,
      tableName: table.tableName,
      userField: table.userField,
      export: table.export,
      delete: {
        strategy: 'ANONYMIZE',
        fields: override.piiFields,
        replacement: override.replacement ?? 'FIXED',
      },
      suspend: {
        strategy: 'ANONYMIZE',
        backup: true,
        piiFields: override.piiFields,
        replacement: override.replacement ?? 'FIXED',
      },
      description: table.description,
    };
  }

  // Default: DELETE
  return {
    modelName: table.modelName,
    tableName: table.tableName,
    userField: table.userField,
    export: table.export,
    delete: {
      strategy: 'DELETE',
    },
    suspend: {
      strategy: 'DELETE',
      backup: true,
    },
    description: table.description,
  };
}

/**
 * The composed GDPR registry.
 * This is the runtime view used by all GDPR services.
 *
 * @deprecated Access via helper functions instead (getExportableTables, etc.)
 */
export const GDPR_REGISTRY: readonly GdprTableConfig[] = GDPR_EXPORT_TABLES.map(composeTableConfig);

// ─────────────────────────────────────────────────────────────
// Registry Helper Functions
// ─────────────────────────────────────────────────────────────

/**
 * Get all tables registered for GDPR export.
 */
export function getExportableTables(): GdprTableConfig[] {
  return GDPR_REGISTRY.filter((table) => table.export);
}

/**
 * Get all tables registered for GDPR deletion.
 */
export function getDeletableTables(): GdprTableConfig[] {
  return [...GDPR_REGISTRY]; // All registered tables are deletable
}

/**
 * Check if a model is registered in the GDPR registry.
 */
export function isModelRegistered(modelName: string): boolean {
  return GDPR_EXPORT_TABLES.some((table) => table.modelName === modelName);
}

/**
 * Check if a model is explicitly excluded from GDPR.
 */
export function isModelExcluded(modelName: string): boolean {
  return GDPR_EXCLUDED_TABLES.includes(modelName);
}

/**
 * Check if a model has an ANONYMIZE override.
 */
export function hasAnonymizeOverride(modelName: string): boolean {
  return modelName in GDPR_ANONYMIZE_OVERRIDES;
}

/**
 * Get the registry config for a specific model.
 */
export function getModelConfig(modelName: string): GdprTableConfig | undefined {
  return GDPR_REGISTRY.find((table) => table.modelName === modelName);
}

/**
 * Get all tables that must be processed during GDPR suspension.
 *
 * Returns ALL registered tables (IMMEDIATE + DEFERRED).
 * For specific risk levels, use getImmediateSuspensionTables() or getDeferredSuspensionTables().
 */
export function getSuspendableTables(): GdprTableConfig[] {
  return [...GDPR_REGISTRY]; // All tables are suspendable
}

/**
 * Get tables that must be processed IMMEDIATELY at suspension request time (T+0).
 *
 * These tables are backed up and DELETED before returning from requestSuspension().
 * This list is intentionally small and explicit.
 *
 * IMMEDIATE-risk deletion is about behavioral safety, not completeness.
 * Full anonymization is always handled by cron.
 */
export function getImmediateSuspensionTables(): GdprTableConfig[] {
  return GDPR_REGISTRY.filter((t) => {
    const def = GDPR_EXPORT_TABLES.find((d) => d.modelName === t.modelName);
    return def?.suspensionRisk === 'IMMEDIATE';
  });
}

/**
 * Get tables that are processed by cron (deferred suspension).
 *
 * These are tables NOT marked as IMMEDIATE risk.
 */
export function getDeferredSuspensionTables(): GdprTableConfig[] {
  return GDPR_REGISTRY.filter((t) => {
    const def = GDPR_EXPORT_TABLES.find((d) => d.modelName === t.modelName);
    return def?.suspensionRisk !== 'IMMEDIATE';
  });
}

/**
 * Get effective PII fields for suspension (ANONYMIZE strategy only).
 *
 * For DELETE strategy, returns empty array (rows are deleted entirely).
 * For ANONYMIZE strategy, returns piiFields from override.
 */
export function getEffectiveSuspendPiiFields(config: GdprTableConfig): string[] {
  if (config.suspend.strategy === 'DELETE') {
    return [];
  }
  return config.suspend.piiFields ?? [];
}

/**
 * Get effective suspension replacement strategy for a table.
 */
export function getEffectiveSuspendReplacement(config: GdprTableConfig): GdprReplacementStrategy {
  return config.suspend.replacement ?? 'FIXED';
}

// ─────────────────────────────────────────────────────────────
// Validation Functions
// ─────────────────────────────────────────────────────────────

/**
 * Validation error for GDPR registry configuration.
 */
export interface GdprRegistryValidationError {
  tableName: string;
  modelName: string;
  error: string;
}

/**
 * Validate the GDPR registry configuration.
 *
 * Checks:
 * 1. All referenced models exist in Prisma schema (guardrail against drift)
 * 2. All ANONYMIZE overrides have non-empty piiFields
 * 3. All ANONYMIZE overrides reference tables in GDPR_EXPORT_TABLES
 * 4. GDPR_INCLUDED_TABLES ↔ GDPR_EXPORT_TABLES consistency
 *
 * Note: DELETE tables require no validation (it's the default).
 *
 * @returns Array of validation errors (empty if valid)
 */
export function validateGdprRegistry(): GdprRegistryValidationError[] {
  const errors: GdprRegistryValidationError[] = [];

  // ─────────────────────────────────────────────────────────────
  // GUARDRAIL: Verify all referenced models exist in Prisma schema
  // ─────────────────────────────────────────────────────────────
  const prismaModelNames = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name));

  // Check GDPR_INCLUDED_TABLES models exist
  for (const modelName of GDPR_INCLUDED_TABLES) {
    if (!prismaModelNames.has(modelName)) {
      errors.push({
        tableName: 'unknown',
        modelName,
        error:
          `Model "${modelName}" is in GDPR_INCLUDED_TABLES but does not exist in Prisma schema. ` +
          'Remove it from GDPR_INCLUDED_TABLES or add the model to schema.prisma.',
      });
    }
  }

  // Check GDPR_EXCLUDED_TABLES models exist
  for (const modelName of GDPR_EXCLUDED_TABLES) {
    if (!prismaModelNames.has(modelName)) {
      errors.push({
        tableName: 'unknown',
        modelName,
        error:
          `Model "${modelName}" is in GDPR_EXCLUDED_TABLES but does not exist in Prisma schema. ` +
          'Remove it from GDPR_EXCLUDED_TABLES or add the model to schema.prisma.',
      });
    }
  }

  // Check GDPR_EXPORT_TABLES models exist
  for (const table of GDPR_EXPORT_TABLES) {
    if (!prismaModelNames.has(table.modelName)) {
      errors.push({
        tableName: table.tableName,
        modelName: table.modelName,
        error:
          `Model "${table.modelName}" is in GDPR_EXPORT_TABLES but does not exist in Prisma schema. ` +
          'Remove it from GDPR_EXPORT_TABLES or add the model to schema.prisma.',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Validate ANONYMIZE overrides
  // ─────────────────────────────────────────────────────────────
  for (const [modelName, override] of Object.entries(GDPR_ANONYMIZE_OVERRIDES)) {
    // Check override references a registered table
    const table = GDPR_EXPORT_TABLES.find((t) => t.modelName === modelName);
    if (!table) {
      errors.push({
        tableName: 'unknown',
        modelName,
        error:
          'ANONYMIZE override references a model not in GDPR_EXPORT_TABLES. ' +
          'Remove the override or add the table to GDPR_EXPORT_TABLES.',
      });
      continue;
    }

    // Check piiFields is non-empty
    if (!override.piiFields || override.piiFields.length === 0) {
      errors.push({
        tableName: table.tableName,
        modelName,
        error:
          'ANONYMIZE override has empty piiFields. ' +
          'Either declare piiFields or remove the override (to use DELETE).',
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Validate GDPR_INCLUDED_TABLES ↔ GDPR_EXPORT_TABLES consistency
  // ─────────────────────────────────────────────────────────────

  // Validate all GDPR_EXPORT_TABLES are in GDPR_INCLUDED_TABLES (from app.constants.ts)
  for (const table of GDPR_EXPORT_TABLES) {
    if (!GDPR_INCLUDED_TABLES.includes(table.modelName)) {
      errors.push({
        tableName: table.tableName,
        modelName: table.modelName,
        error:
          'Table is in GDPR_EXPORT_TABLES but not in GDPR_INCLUDED_TABLES (app.constants.ts). ' +
          'Add it to GDPR_INCLUDED_TABLES in src/config/app.constants.ts.',
      });
    }
  }

  // Validate all GDPR_INCLUDED_TABLES have entries in GDPR_EXPORT_TABLES
  for (const modelName of GDPR_INCLUDED_TABLES) {
    if (!GDPR_EXPORT_TABLES.some((t) => t.modelName === modelName)) {
      errors.push({
        tableName: 'unknown',
        modelName,
        error:
          'Table is in GDPR_INCLUDED_TABLES (app.constants.ts) but has no entry in GDPR_EXPORT_TABLES. ' +
          'Add field-level configuration to GDPR_EXPORT_TABLES in gdpr.registry.ts.',
      });
    }
  }

  return errors;
}

/**
 * Assert the GDPR registry is valid at startup.
 * Throws an error if any validation fails.
 */
export function assertGdprRegistryValid(): void {
  const errors = validateGdprRegistry();
  if (errors.length > 0) {
    const errorMessages = errors
      .map((e) => `  - ${e.modelName} (${e.tableName}): ${e.error}`)
      .join('\n');
    throw new Error(`GDPR Registry validation failed:\n${errorMessages}`);
  }
}

/**
 * @deprecated Use getEffectiveSuspendPiiFields instead
 */
export function getEffectiveSuspendFields(config: GdprTableConfig): string[] {
  return getEffectiveSuspendPiiFields(config);
}

// ─────────────────────────────────────────────────────────────
// Dynamic Export Helper Functions
// ─────────────────────────────────────────────────────────────

/**
 * Check if a table uses dynamic export (has exportFields defined).
 */
export function usesDynamicExport(modelName: string): boolean {
  const table = GDPR_EXPORT_TABLES.find((t) => t.modelName === modelName);
  return !!table?.exportFields && table.exportFields.length > 0;
}

/**
 * Get export field definitions for a table.
 * Returns undefined if table doesn't use dynamic export.
 */
export function getExportFields(modelName: string): GdprExportFieldDef[] | undefined {
  const table = GDPR_EXPORT_TABLES.find((t) => t.modelName === modelName);
  return table?.exportFields;
}

/**
 * Get the section configuration for a table.
 */
export function getTableSection(modelName: string): { name: string; order: number } | undefined {
  const table = GDPR_EXPORT_TABLES.find((t) => t.modelName === modelName);
  if (!table?.section) return undefined;
  return { name: table.section, order: table.sectionOrder ?? 100 };
}

/**
 * Get parent relation info for nested tables.
 */
export function getParentRelation(
  modelName: string,
): { parentModel: string; relation: string } | undefined {
  const table = GDPR_EXPORT_TABLES.find((t) => t.modelName === modelName);
  if (!table?.parentModel || !table?.parentRelation) return undefined;
  return { parentModel: table.parentModel, relation: table.parentRelation };
}

/**
 * Get all tables that belong to a specific section.
 */
export function getTablesBySection(sectionName: string): GdprExportTableDef[] {
  return GDPR_EXPORT_TABLES.filter((t) => t.section === sectionName && t.export).sort(
    (a, b) => (a.sectionOrder ?? 100) - (b.sectionOrder ?? 100),
  );
}

/**
 * Get all unique sections with their tables, sorted by order.
 */
export function getAllSections(): Array<{ section: string; tables: GdprExportTableDef[] }> {
  const sections = new Map<string, GdprExportTableDef[]>();

  for (const table of GDPR_EXPORT_TABLES) {
    if (!table.export || !table.section) continue;
    const existing = sections.get(table.section) ?? [];
    existing.push(table);
    sections.set(table.section, existing);
  }

  return Array.from(sections.entries())
    .map(([section, tables]) => ({
      section,
      tables: tables.sort((a, b) => (a.sectionOrder ?? 100) - (b.sectionOrder ?? 100)),
    }))
    .sort((a, b) => {
      const orderA = a.tables[0]?.sectionOrder ?? 100;
      const orderB = b.tables[0]?.sectionOrder ?? 100;
      return orderA - orderB;
    });
}

/**
 * Build a Prisma select object from export field definitions.
 * Always includes 'id' and 'createdAt'/'updatedAt' if not explicitly defined.
 */
export function buildPrismaSelect(exportFields: GdprExportFieldDef[]): Record<string, true> {
  const select: Record<string, true> = { id: true };

  for (const field of exportFields) {
    if (field.include !== false) {
      select[field.field] = true;
    }
  }

  return select;
}

/**
 * Mask a string value according to mask configuration.
 */
export function maskValue(
  value: string,
  config: { showStart: number; showEnd: number } = { showStart: 15, showEnd: 4 },
): string {
  if (!value) return '';
  const { showStart, showEnd } = config;

  if (value.length <= showStart + showEnd) {
    return value; // Too short to mask
  }

  return `${value.slice(0, showStart)}...${value.slice(-showEnd)}`;
}

/**
 * Format a field value based on its type.
 */
export function formatFieldValue(
  value: unknown,
  fieldDef: GdprExportFieldDef,
  locale: string = 'en',
): string {
  if (value === null || value === undefined) {
    return '';
  }

  switch (fieldDef.type) {
    case 'date':
      return value instanceof Date
        ? value.toLocaleDateString(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : String(value);

    case 'boolean':
      return value ? 'Yes' : 'No';

    case 'email':
      return String(value);

    case 'masked':
      return maskValue(String(value), fieldDef.maskConfig);

    case 'number':
      return typeof value === 'number' ? value.toLocaleString(locale) : String(value);

    case 'json':
      if (typeof value === 'object') {
        try {
          return JSON.stringify(value, null, 2);
        } catch {
          return '[Complex Object]';
        }
      }
      return String(value);

    case 'string':
    default:
      return String(value);
  }
}
