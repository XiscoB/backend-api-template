import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SuspensionBackup } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GDPR_EXPORT_TABLES, GdprTableConfig } from './gdpr.registry';
import { GdprBackupStrategy } from './strategies/gdpr-backup.strategy';
import { GdprDeletionStrategy } from './strategies/gdpr-deletion.strategy';
import { GdprFieldAnonymizationStrategy } from './strategies/gdpr-field-anonymization.strategy';
import { GdprOwnershipResolutionStrategy } from './strategies/gdpr-ownership-resolution.strategy';
import { GdprRestorationStrategy } from './strategies/gdpr-restoration.strategy';
import {
  AnonymizationMode,
  AnonymizationOptions,
  AnonymizationResult,
  TableAnonymizationSummary,
  TableRestoreSummary,
} from './strategies/gdpr-anonymization-strategy.types';

export type {
  AnonymizationMode,
  AnonymizationOptions,
  AnonymizationResult,
  TableAnonymizationSummary,
  TableRestoreSummary,
} from './strategies/gdpr-anonymization-strategy.types';

/**
 * GDPR Anonymization Orchestrator
 *
 * Coordinates GDPR processing strategies while keeping sequencing explicit and centralized.
 * Domain decisions live in strategy classes; this service only orchestrates execution order.
 */
@Injectable()
export class GdprAnonymizationService {
  private readonly logger = new Logger(GdprAnonymizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownershipStrategy: GdprOwnershipResolutionStrategy,
    private readonly backupStrategy: GdprBackupStrategy,
    private readonly deletionStrategy: GdprDeletionStrategy,
    private readonly fieldAnonymizationStrategy: GdprFieldAnonymizationStrategy,
    private readonly restorationStrategy: GdprRestorationStrategy,
  ) {}

  generateAnonymizedUid(): string {
    return `anon_${randomUUID().substring(0, 16)}`;
  }

  generateSuspensionUid(): string {
    return `susp_${randomUUID()}`;
  }

  async anonymize(options: AnonymizationOptions): Promise<AnonymizationResult> {
    const { identityId, anonymizedUid, mode, suspensionUid, tables } = options;

    if (mode === 'SUSPEND' && !suspensionUid) {
      throw new Error('suspensionUid is required for SUSPEND mode');
    }

    const tablesToProcess = tables ?? (await this.getSuspendableTables());

    // Orchestration invariant: delete/anonymize children first so cascades cannot remove child rows
    // before they are snapshotted.
    const sortedTables = this.sortTablesChildrenFirst(tablesToProcess);

    // Orchestration invariant: resolve all ownership keys before mutations so child lookups
    // still work even when parent rows are deleted earlier in this batch.
    const ownershipKeyMap = await this.ownershipStrategy.resolveAllOwnershipKeys(
      sortedTables,
      identityId,
    );

    const summary: TableAnonymizationSummary[] = [];
    let totalRowsAffected = 0;

    for (const tableConfig of sortedTables) {
      const ownershipKey = ownershipKeyMap.get(tableConfig.userField) ?? null;
      const tableSummary = await this.processTable(
        tableConfig,
        identityId,
        anonymizedUid,
        mode,
        suspensionUid,
        ownershipKey,
      );
      summary.push(tableSummary);
      totalRowsAffected += tableSummary.rows;
    }

    return {
      identityId,
      anonymizedUid,
      mode,
      suspensionUid,
      summary,
      totalRowsAffected,
    };
  }

  async restoreFromBackups(
    suspensionUid: string,
  ): Promise<{ tableSummaries: TableRestoreSummary[]; totalRowsRestored: number }> {
    const backups = await this.prisma.suspensionBackup.findMany({
      where: {
        suspensionUid,
        backupUsed: false,
      },
    });

    // Orchestration invariant: restore parents before children to satisfy FK constraints.
    const sortedBackups = this.sortBackupsParentsFirst(backups);

    const tableSummaries: TableRestoreSummary[] = [];
    let totalRowsRestored = 0;

    for (const backup of sortedBackups) {
      if (!this.isRecordArray(backup.backupData)) {
        this.logger.warn(`Invalid backup data for ${backup.tableName}, skipping restore`);
        continue;
      }

      const restoreResult = await this.restorationStrategy.restoreRows(
        backup.tableName,
        backup.backupData,
      );

      if (restoreResult.kind === 'MODEL_NOT_FOUND') {
        this.logger.warn(`Model ${backup.tableName} not found in Prisma client`);
        tableSummaries.push({ table: backup.tableName, rows: 0, restored: false });
      } else {
        tableSummaries.push({ table: backup.tableName, rows: restoreResult.count, restored: true });
        totalRowsRestored += restoreResult.count;
      }

      await this.prisma.suspensionBackup.update({
        where: { id: backup.id },
        data: {
          backupUsed: true,
          restoredAt: new Date(),
        },
      });
    }

    return { tableSummaries, totalRowsRestored };
  }

  private async processTable(
    config: GdprTableConfig,
    identityId: string,
    anonymizedUid: string,
    mode: AnonymizationMode,
    suspensionUid: string | undefined,
    ownershipKey: string | null,
  ): Promise<TableAnonymizationSummary> {
    const { modelName, tableName, userField } = config;
    const suspendStrategy = config.suspend?.strategy ?? 'DELETE';

    this.logger.log(`[GDPR] Processing ${modelName} (strategy: ${suspendStrategy})`);

    if (!ownershipKey) {
      this.logger.log(`[GDPR] ${modelName} → 0 rows (no ownership key resolved)`);
      return { table: tableName, rows: 0, backedUp: false, mode, action: 'SKIPPED' };
    }

    const snapshot = await this.backupStrategy.loadRows(config, ownershipKey);
    if (snapshot.kind === 'MODEL_NOT_FOUND') {
      this.logger.warn(`[GDPR] ${modelName} → model not found in Prisma client (SKIPPED)`);
      return { table: tableName, rows: 0, backedUp: false, mode, action: 'SKIPPED' };
    }

    const rows = snapshot.rows;
    if (rows.length === 0) {
      this.logger.log(`[GDPR] ${modelName} → 0 rows (skipped)`);
      return { table: tableName, rows: 0, backedUp: mode === 'SUSPEND', mode, action: 'SKIPPED' };
    }

    let backedUp = false;
    if (mode === 'SUSPEND' && suspensionUid) {
      await this.backupStrategy.createBackup({
        suspensionUid,
        identityId,
        anonymizedUid,
        modelName,
        rows,
      });
      backedUp = true;
      this.logger.log(`[GDPR] ${modelName} → ${rows.length} rows found → BACKUP created`);
    }

    if (mode === 'SUSPEND' && rows.length > 0 && !backedUp) {
      this.logger.error(
        `[GDPR] ${modelName} → DATA LOSS RISK: ${rows.length} rows will be processed without backup!`,
      );
    }

    if (suspendStrategy === 'DELETE') {
      const deletionResult = await this.deletionStrategy.deleteRows(
        modelName,
        userField,
        ownershipKey,
      );
      if (deletionResult.kind !== 'APPLIED') {
        this.logger.warn(`[GDPR] ${modelName} → model not found in Prisma client (SKIPPED)`);
        return { table: tableName, rows: 0, backedUp, mode, action: 'SKIPPED' };
      }

      this.logger.log(
        `[GDPR] ${modelName} → ${rows.length} rows → BACKUP + DELETE (${deletionResult.count} deleted)`,
      );

      return {
        table: tableName,
        rows: deletionResult.count,
        backedUp,
        mode,
        action: 'DELETED',
      };
    }

    const anonymizationResult = await this.fieldAnonymizationStrategy.anonymizeRows(
      config,
      ownershipKey,
      mode,
    );

    if (anonymizationResult.kind === 'SKIPPED') {
      this.logger.warn(`[GDPR] ${modelName} → ANONYMIZE declared but no piiFields (SKIPPED)`);
      return { table: tableName, rows: rows.length, backedUp, mode, action: 'SKIPPED' };
    }

    if (anonymizationResult.kind === 'MODEL_NOT_FOUND') {
      this.logger.warn(`[GDPR] ${modelName} → model not found in Prisma client (SKIPPED)`);
      return { table: tableName, rows: 0, backedUp, mode, action: 'SKIPPED' };
    }

    this.logger.log(
      `[GDPR] ${modelName} → ${rows.length} rows → BACKUP + ANONYMIZE (${anonymizationResult.count} anonymized)`,
    );

    return {
      table: tableName,
      rows: anonymizationResult.count,
      backedUp,
      mode,
      action: 'ANONYMIZED',
    };
  }

  private sortTablesChildrenFirst(tables: GdprTableConfig[]): GdprTableConfig[] {
    const children: GdprTableConfig[] = [];
    const parents: GdprTableConfig[] = [];

    for (const table of tables) {
      if (table.userField === 'identityId') {
        parents.push(table);
      } else {
        children.push(table);
      }
    }

    return [...children, ...parents];
  }

  private sortBackupsParentsFirst(backups: SuspensionBackup[]): SuspensionBackup[] {
    const tableUserFieldMap = new Map<string, string>();
    for (const table of GDPR_EXPORT_TABLES) {
      tableUserFieldMap.set(table.modelName, table.userField);
    }

    const parents: SuspensionBackup[] = [];
    const children: SuspensionBackup[] = [];

    for (const backup of backups) {
      const userField = tableUserFieldMap.get(backup.tableName);
      if (userField === 'identityId' || userField === undefined) {
        parents.push(backup);
      } else {
        children.push(backup);
      }
    }

    return [...parents, ...children];
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isRecordArray(value: unknown): value is Record<string, unknown>[] {
    return Array.isArray(value) && value.every((item) => this.isRecord(item));
  }

  private async getSuspendableTables(): Promise<GdprTableConfig[]> {
    const { getSuspendableTables } = await import('./gdpr.registry');
    return getSuspendableTables();
  }
}
