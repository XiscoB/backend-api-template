import { Injectable, Logger } from '@nestjs/common';
import { GDPR_REGISTRY, GDPR_EXCLUDED_TABLES, GdprTableConfig } from '../gdpr/gdpr.registry';

/**
 * GDPR coverage status for a table.
 */
export enum GdprCoverageStatus {
  /** Table is included in GDPR exports */
  INCLUDED = 'INCLUDED',
  /** Table is explicitly excluded from GDPR (infrastructure table) */
  EXCLUDED = 'EXCLUDED',
  /** Table is not registered - WARNING, potential coverage gap */
  NOT_REGISTERED = 'NOT_REGISTERED',
}

/**
 * GDPR coverage information for a single table.
 */
export interface GdprTableCoverageInfo {
  /** Database table name (snake_case) */
  tableName: string;
  /** Prisma model name (PascalCase) */
  modelName?: string;
  /** GDPR coverage status */
  status: GdprCoverageStatus;
  /** Whether the table is included in GDPR data exports */
  includedInExport: boolean;
  /** Deletion strategy (if registered) */
  deletionStrategy?: 'DELETE' | 'ANONYMIZE';
  /** Description (if registered) */
  description?: string;
  /** Warning message for NOT_REGISTERED tables */
  warning?: string;
}

/**
 * Summary of GDPR coverage across all tables.
 */
export interface GdprCoverageSummary {
  /** Total number of tables in the system */
  totalTables: number;
  /** Number of tables included in GDPR exports */
  includedCount: number;
  /** Number of tables explicitly excluded (infrastructure) */
  excludedCount: number;
  /** Number of tables not registered - potential gaps */
  notRegisteredCount: number;
  /** Whether there are any coverage warnings */
  hasWarnings: boolean;
  /** Individual table coverage details */
  tables: GdprTableCoverageInfo[];
}

/**
 * All known tables in the system.
 *
 * This list should match the Prisma schema.
 * When new tables are added, they MUST be registered in GDPR registry.
 */
const ALL_DATABASE_TABLES: Array<{ tableName: string; modelName: string }> = [
  // Identity & Profile
  { tableName: 'identities', modelName: 'Identity' },
  { tableName: 'profiles', modelName: 'Profile' },

  // GDPR Infrastructure
  { tableName: 'gdpr_requests', modelName: 'Request' },
  { tableName: 'gdpr_export_files', modelName: 'GdprExportFile' },
  { tableName: 'gdpr_audit_logs', modelName: 'GdprAuditLog' },
  { tableName: 'account_suspensions', modelName: 'AccountSuspension' },
  { tableName: 'suspension_backups', modelName: 'SuspensionBackup' },

  // Notifications
  { tableName: 'notification_logs', modelName: 'NotificationLog' },
  { tableName: 'scheduled_notifications', modelName: 'ScheduledNotification' },
  { tableName: 'user_notification_profile', modelName: 'UserNotificationProfile' },
  { tableName: 'user_email_channel', modelName: 'UserEmailChannel' },
  { tableName: 'user_push_channel', modelName: 'UserPushChannel' },
  { tableName: 'notification_delivery_log', modelName: 'NotificationDeliveryLog' },

  // Scheduler
  { tableName: 'scheduler_locks', modelName: 'SchedulerLock' },

  // GDPR Infrastructure
  { tableName: 'gdpr_deletion_emails', modelName: 'GdprDeletionEmail' },
  { tableName: 'deletion_legal_holds', modelName: 'DeletionLegalHold' },

  // Internal Logs
  { tableName: 'internal_logs', modelName: 'InternalLog' },

  // Moderation
  { tableName: 'reports', modelName: 'Report' },
];

/**
 * GDPR Coverage Service
 *
 * Provides visibility into GDPR coverage across all database tables.
 * Used by the internal admin console to highlight potential gaps.
 *
 * This service:
 * - Lists all tables in the system
 * - Shows which tables are included/excluded from GDPR
 * - Warns about tables that are not registered (potential gaps)
 */
@Injectable()
export class GdprCoverageService {
  private readonly logger = new Logger(GdprCoverageService.name);

  /**
   * Get GDPR coverage information for all tables.
   */
  getCoverageSummary(): GdprCoverageSummary {
    const tables: GdprTableCoverageInfo[] = [];
    let includedCount = 0;
    let excludedCount = 0;
    let notRegisteredCount = 0;

    for (const { tableName, modelName } of ALL_DATABASE_TABLES) {
      const coverage = this.getTableCoverage(tableName, modelName);
      tables.push(coverage);

      switch (coverage.status) {
        case GdprCoverageStatus.INCLUDED:
          includedCount++;
          break;
        case GdprCoverageStatus.EXCLUDED:
          excludedCount++;
          break;
        case GdprCoverageStatus.NOT_REGISTERED:
          notRegisteredCount++;
          break;
      }
    }

    const hasWarnings = notRegisteredCount > 0;

    if (hasWarnings) {
      this.logger.warn(`GDPR coverage warning: ${notRegisteredCount} table(s) are not registered`);
    }

    return {
      totalTables: tables.length,
      includedCount,
      excludedCount,
      notRegisteredCount,
      hasWarnings,
      tables,
    };
  }

  /**
   * Get GDPR coverage for a specific table.
   */
  private getTableCoverage(tableName: string, modelName: string): GdprTableCoverageInfo {
    // Check if explicitly excluded
    if ((GDPR_EXCLUDED_TABLES as readonly string[]).includes(modelName)) {
      return {
        tableName,
        modelName,
        status: GdprCoverageStatus.EXCLUDED,
        includedInExport: false,
        description: 'Infrastructure table - excluded from GDPR operations',
      };
    }

    // Check if registered in GDPR registry
    const registryEntry = GDPR_REGISTRY.find(
      (entry: GdprTableConfig) => entry.tableName === tableName || entry.modelName === modelName,
    );

    if (registryEntry) {
      return {
        tableName,
        modelName,
        status: registryEntry.export ? GdprCoverageStatus.INCLUDED : GdprCoverageStatus.EXCLUDED,
        includedInExport: registryEntry.export,
        deletionStrategy: registryEntry.delete.strategy,
        description: registryEntry.description,
      };
    }

    // Not registered - potential gap
    return {
      tableName,
      modelName,
      status: GdprCoverageStatus.NOT_REGISTERED,
      includedInExport: false,
      warning: `Table "${tableName}" (${modelName}) is not registered in GDPR registry. This may be a coverage gap.`,
    };
  }

  /**
   * Get list of tables with coverage warnings.
   */
  getWarnings(): GdprTableCoverageInfo[] {
    const summary = this.getCoverageSummary();
    return summary.tables.filter((t) => t.status === GdprCoverageStatus.NOT_REGISTERED);
  }
}
