import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { getTranslations, DEFAULT_LANGUAGE } from '../../common/translations';
import {
  INTERNAL_ADMIN_CONFIG,
  TABLE_TO_PRISMA_MAP,
  isFieldProtected,
} from './internal-admin.config';
import { GENERATED_ADMIN_TABLES } from './generated-admin-tables';
import {
  AdminQueryParams,
  AdminUpdateParams,
  AdminOperationResult,
  AdminTableInfo,
} from './admin.types';

/**
 * Internal Admin Service.
 *
 * Provides controlled read and write operations for the admin console.
 *
 * Security constraints (from INTERNAL_ADMIN_CONFIG):
 * - Only operates on explicitly allowlisted tables
 * - No bulk operations
 * - No deletes
 * - All operations are logged
 */
@Injectable()
export class InternalAdminService implements OnModuleInit {
  private readonly logger = new Logger(InternalAdminService.name);
  private readonly config = INTERNAL_ADMIN_CONFIG;
  private readonly effectiveTableMap: Record<string, { prismaDelegate: string; writable: boolean }>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    // MERGE STRATEGY: Explicit config (TABLE_TO_PRISMA_MAP) always overrides generated defaults.
    this.effectiveTableMap = {
      ...GENERATED_ADMIN_TABLES,
      ...TABLE_TO_PRISMA_MAP,
    };
  }

  /**
   * Startup guardrail: verify all admin table mappings point to real Prisma delegates.
   *
   * Failure mode: Hard startup failure with explicit error message.
   * Purpose: Prevent stale admin config referencing non-existent tables.
   */
  onModuleInit(): void {
    this.validatePrismaDelegatesExist();
    this.logger.log('✅ Admin table mapping validation passed');
  }

  /**
   * Validate that all Prisma delegates in effectiveTableMap actually exist on PrismaClient.
   *
   * @throws Error if any delegate is missing (hard startup failure)
   */
  private validatePrismaDelegatesExist(): void {
    const missingDelegates: Array<{ tableName: string; prismaDelegate: string }> = [];

    for (const [tableName, config] of Object.entries(this.effectiveTableMap)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const delegate = (this.prisma as any)[config.prismaDelegate];
      if (!delegate || typeof delegate !== 'object') {
        missingDelegates.push({ tableName, prismaDelegate: config.prismaDelegate });
      }
    }

    if (missingDelegates.length > 0) {
      const errorLines = missingDelegates.map(
        (m) => `  - Admin table "${m.tableName}" → prisma.${m.prismaDelegate} does not exist`,
      );
      throw new Error(
        `Admin table mapping validation failed:\n${errorLines.join('\n')}\n\n` +
          'Fix: Remove stale entries from TABLE_TO_PRISMA_MAP or GENERATED_ADMIN_TABLES, ' +
          'or ensure the Prisma schema includes the referenced models.',
      );
    }
  }

  /**
   * List all visible tables with their permissions.
   */
  listTables(): AdminTableInfo[] {
    const { hidden } = this.config.tables;
    const hiddenSet = new Set(hidden as readonly string[]);

    return Object.entries(this.effectiveTableMap)
      .filter(([name]) => !hiddenSet.has(name))
      .map(([name, config]) => ({
        name,
        readable: true,
        writable: config.writable,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Query records from a visible table.
   *
   * @param params - Query parameters
   * @param adminSub - The admin user's sub (for logging)
   */
  async queryTable(
    params: AdminQueryParams,
    adminSub: string,
  ): Promise<{ records: unknown[]; total: number }> {
    const { table, limit = 50, offset = 0, filterField, filterValue } = params;

    // Validate table access
    if (!this.isTableVisible(table)) {
      this.logger.warn(`Admin ${adminSub} attempted to query hidden table: ${table}`);
      throw new NotFoundException(`Table "${table}" not found`);
    }

    // Validate limit
    const safeLimit = Math.min(Math.max(1, limit), 100);

    // Build where clause
    let where: Record<string, unknown> = {};
    if (filterField && filterValue !== undefined) {
      where = { [filterField]: filterValue };
    }

    this.logger.log(
      `Admin ${adminSub} querying table: ${table} (limit=${safeLimit}, offset=${offset})`,
    );

    try {
      // Dynamic Prisma access (safe because table is validated against allowlist)
      const prismaModel = this.getPrismaModel(table);

      const [records, total] = await Promise.all([
        prismaModel.findMany({
          where,
          take: safeLimit,
          skip: offset,
          orderBy: { updatedAt: 'desc' }, // Show recently modified records first
        }),
        prismaModel.count({ where }),
      ]);

      // Audit log
      await this.auditService.logAdminAction({
        adminUserId: adminSub,
        action: 'query_table',
        entityType: table,
        metadata: { limit: safeLimit, offset, filterField, filterValue },
      });

      return {
        records: records.map((r) => this.translateEnums(r as Record<string, unknown>, table)),
        total,
      };
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to query table ${table}: ${err.message}`, err.stack);
      throw new BadRequestException(`Failed to query table "${table}": ${err.message}`);
    }
  }

  /**
   * Get a single record by ID from a visible table.
   *
   * @param table - Table name (must be in VISIBLE_TABLES)
   * @param id - Record ID
   * @param adminSub - The admin user's sub (for logging)
   */
  async getRecord(table: string, id: string, adminSub: string): Promise<unknown> {
    if (!this.isTableVisible(table)) {
      this.logger.warn(`Admin ${adminSub} attempted to access hidden table: ${table}`);
      throw new NotFoundException(`Table "${table}" not found`);
    }

    this.logger.log(`Admin ${adminSub} reading record ${id} from table: ${table}`);

    try {
      const prismaModel = this.getPrismaModel(table);
      const record = await prismaModel.findUnique({
        where: { id }, // All tables have id primary key
      });

      if (!record) {
        throw new NotFoundException(`Record "${id}" not found in table "${table}"`);
      }

      // Audit log
      await this.auditService.logAdminAction({
        adminUserId: adminSub,
        action: 'view_record',
        entityType: table,
        entityId: id,
      });

      return this.translateEnums(record as Record<string, unknown>, table);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const err = error as Error;
      this.logger.error(`Failed to get record from ${table}: ${err.message}`, err.stack);
      throw new BadRequestException(`Failed to get record from table "${table}": ${err.message}`);
    }
  }

  /**
   * Update a single record in a writable table.
   *
   * @param params - Update parameters
   * @param adminSub - The admin user's sub (for logging)
   */
  async updateRecord(params: AdminUpdateParams, adminSub: string): Promise<AdminOperationResult> {
    const { table, id, data } = params;

    // Validate table is writable
    if (!this.isTableWritable(table)) {
      this.logger.warn(`Admin ${adminSub} attempted to write to non-writable table: ${table}`);
      throw new BadRequestException(`Table "${table}" is not writable`);
    }

    // Prevent empty updates
    if (!data || Object.keys(data).length === 0) {
      throw new BadRequestException('No data provided for update');
    }

    // Prevent updating protected fields (from config)
    const attemptedProtectedFields = Object.keys(data).filter((key) => isFieldProtected(key));
    if (attemptedProtectedFields.length > 0) {
      throw new BadRequestException(
        `Cannot update protected fields: ${attemptedProtectedFields.join(', ')}`,
      );
    }

    // Log write operation (as per safety config)
    if (this.config.safety.logWriteOperations) {
      this.logger.log(
        `Admin ${adminSub} updating record ${id} in table: ${table} (fields: ${Object.keys(data).join(', ')})`,
      );
    }

    try {
      const prismaModel = this.getPrismaModel(table);

      // Verify record exists
      const existing = await prismaModel.findUnique({
        where: { id }, // All tables have id primary key
      });
      if (!existing) {
        throw new NotFoundException(`Record "${id}" not found in table "${table}"`);
      }

      // Perform update
      await prismaModel.update({
        where: { id }, // All tables have id primary key
        data: {
          ...data,
          // Note: No updatedAt - tables don't have auto-update timestamps
        },
      });

      this.logger.log(`Admin ${adminSub} successfully updated record ${id} in table: ${table}`);

      // Audit log
      await this.auditService.logAdminAction({
        adminUserId: adminSub,
        action: 'update_record',
        entityType: table,
        entityId: id,
        metadata: { updatedFields: Object.keys(data) },
      });

      return {
        success: true,
        affectedCount: 1,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Failed to update record in ${table}: ${(error as Error).message}`);
      throw new BadRequestException(`Failed to update record in table "${table}"`);
    }
  }

  /**
   * Get Prisma model delegate for a table.
   *
   * Uses explicit TABLE_TO_PRISMA_MAP to convert snake_case table names
   * to camelCase Prisma client delegates.
   *
   * This is safe because table names are validated against the allowlist before calling.
   *
   * CRITICAL: Do NOT use dynamic table access like prisma[tableName].
   * Prisma delegates are camelCase, not snake_case.
   */
  private getPrismaModel(table: string): {
    findMany: (args: unknown) => Promise<unknown[]>;
    findUnique: (args: unknown) => Promise<unknown>;
    count: (args: unknown) => Promise<number>;
    update: (args: unknown) => Promise<unknown>;
  } {
    // Look up Prisma delegate name from effective map
    const mapping = this.effectiveTableMap[table];
    if (!mapping) {
      throw new BadRequestException(`Unknown table: ${table}`);
    }

    const prismaDelegate = mapping.prismaDelegate;

    // Type-safe access to Prisma models
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    const model = (this.prisma as any)[prismaDelegate];
    if (!model) {
      throw new BadRequestException(`Prisma delegate not found: ${prismaDelegate}`);
    }

    return model as {
      findMany: (args: unknown) => Promise<unknown[]>;
      findUnique: (args: unknown) => Promise<unknown>;
      count: (args: unknown) => Promise<number>;
      update: (args: unknown) => Promise<unknown>;
    };
  }

  /**
   * Translate raw enum values to human-readable labels for the admin UI.
   *
   * This ensures the admin console shows translated labels while the
   * database remains canonical.
   */
  private translateEnums(record: Record<string, unknown>, table: string): Record<string, unknown> {
    if (!record) return record;

    const t = getTranslations(DEFAULT_LANGUAGE);
    const result = { ...record };

    // Translate NotificationDeliveryStatus (notification_delivery_log)
    if (table === 'notification_delivery_log' && typeof result.status === 'string') {
      const label =
        t.admin.notificationStatus[result.status as keyof typeof t.admin.notificationStatus];
      if (label) result.status = label;
    }

    // Translate GdprRequestStatus (gdpr_requests)
    if (table === 'gdpr_requests' && typeof result.status === 'string') {
      const label = t.admin.requestStatus[result.status as keyof typeof t.admin.requestStatus];
      if (label) result.status = label;
    }

    // Translate NotificationChannelType (notification_delivery_log)
    if (table === 'notification_delivery_log' && typeof result.channelType === 'string') {
      const label = t.admin.channelType[result.channelType as keyof typeof t.admin.channelType];
      if (label) result.channelType = label;
    }

    // Translate ScheduledNotificationStatus (scheduled_notifications)
    if (table === 'scheduled_notifications' && typeof result.status === 'string') {
      const label = t.admin.scheduledStatus[result.status as keyof typeof t.admin.scheduledStatus];
      if (label) result.status = label;
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // Helper Methods (Internal)
  // ─────────────────────────────────────────────────────────────

  private isTableVisible(tableName: string): boolean {
    const { hidden } = this.config.tables;
    if ((hidden as readonly string[]).includes(tableName)) {
      return false;
    }
    return !!this.effectiveTableMap[tableName];
  }

  private isTableWritable(tableName: string): boolean {
    if (!this.isTableVisible(tableName)) {
      return false;
    }
    return this.effectiveTableMap[tableName]?.writable === true;
  }
}
