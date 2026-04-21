import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  GdprExportTableDef,
  GdprExportFieldDef,
  GDPR_EXPORT_TABLES,
  getExportFields,
  getParentRelation,
  buildPrismaSelect,
  formatFieldValue,
} from './gdpr.registry';

/**
 * GDPR Dynamic Data Collector Service
 *
 * Collects user data dynamically based on the GDPR registry configuration.
 * This service reads the `exportFields` metadata from the registry and:
 * 1. Builds Prisma queries automatically
 * 2. Handles parent/child relations (e.g., UserEmailChannel via UserNotificationProfile)
 * 3. Formats values according to field type
 *
 * Benefits:
 * - Single source of truth (registry defines what to export)
 * - No code changes needed for new tables (just update registry)
 * - Consistent field handling across all tables
 *
 * @see gdpr.registry.ts for table/field definitions
 * @see ADR-008-GDPR-DYNAMIC-EXPORT.md for architecture decision
 */

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/**
 * A collected record with formatted field values.
 */
export interface DynamicCollectedRecord {
  /** Original field values (raw) */
  raw: Record<string, unknown>;

  /** Formatted field values for display */
  formatted: Array<{
    field: string;
    label: string;
    value: string;
    explanation: string;
  }>;
}

/**
 * Collection result for a single table.
 */
export interface DynamicTableCollection {
  tableDef: GdprExportTableDef;
  records: DynamicCollectedRecord[];
  recordCount: number;
}

/**
 * Complete dynamic collection result.
 */
export interface DynamicCollectionResult {
  identityId: string;
  collectedAt: Date;
  tables: DynamicTableCollection[];
  sections: Array<{
    section: string;
    tables: DynamicTableCollection[];
  }>;
}

@Injectable()
export class GdprDynamicCollectorService {
  private readonly logger = new Logger(GdprDynamicCollectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Collect all GDPR data for a user using dynamic registry configuration.
   *
   * This method:
   * 1. Gets all exportable tables from registry
   * 2. For each table with exportFields, queries the database
   * 3. Formats values according to field type
   * 4. Groups results by section
   *
   * @param identityId - The user's identity ID
   * @param locale - Locale for date/number formatting (default: 'en')
   */
  async collectAllData(
    identityId: string,
    locale: string = 'en',
  ): Promise<DynamicCollectionResult> {
    const startTime = Date.now();
    this.logger.debug(`[DynamicCollector] Starting collection for identity: ${identityId}`);

    const tableCollections: DynamicTableCollection[] = [];

    // Get all exportable tables
    const exportableTables = GDPR_EXPORT_TABLES.filter((t) => t.export);

    for (const tableDef of exportableTables) {
      try {
        const collection = await this.collectTable(tableDef, identityId, locale);
        if (collection) {
          tableCollections.push(collection);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[DynamicCollector] Failed to collect ${tableDef.modelName}: ${message}`);
        // Continue with other tables
      }
    }

    // Group by section
    const sectionsMap = new Map<string, DynamicTableCollection[]>();
    for (const collection of tableCollections) {
      const sectionName = collection.tableDef.section ?? 'other';
      const existing = sectionsMap.get(sectionName) ?? [];
      existing.push(collection);
      sectionsMap.set(sectionName, existing);
    }

    const sections = Array.from(sectionsMap.entries())
      .map(([section, tables]) => ({ section, tables }))
      .sort((a, b) => {
        const orderA = a.tables[0]?.tableDef.sectionOrder ?? 100;
        const orderB = b.tables[0]?.tableDef.sectionOrder ?? 100;
        return orderA - orderB;
      });

    const duration = Date.now() - startTime;
    this.logger.debug(
      `[DynamicCollector] Collection complete for ${identityId}: ` +
        `${tableCollections.length} tables, ${sections.length} sections (${duration}ms)`,
    );

    return {
      identityId,
      collectedAt: new Date(),
      tables: tableCollections,
      sections,
    };
  }

  /**
   * Collect data for a single table.
   */
  private async collectTable(
    tableDef: GdprExportTableDef,
    identityId: string,
    locale: string,
  ): Promise<DynamicTableCollection | null> {
    const exportFields = getExportFields(tableDef.modelName);

    if (!exportFields) {
      this.logger.debug(
        `[DynamicCollector] Skipping ${tableDef.modelName} (no exportFields defined, use legacy collector)`,
      );
      return null;
    }

    // Check if this is a nested table (has parent relation)
    const parentRelation = getParentRelation(tableDef.modelName);

    let records: Record<string, unknown>[];

    if (parentRelation) {
      // Nested table: fetch via parent relation
      records = await this.collectNestedRecords(tableDef, parentRelation, identityId, exportFields);
    } else {
      // Direct table: fetch by identityId
      records = await this.collectDirectRecords(tableDef, identityId, exportFields);
    }

    // Format records
    const formattedRecords = records.map((raw) => this.formatRecord(raw, exportFields, locale));

    this.logger.debug(
      `[DynamicCollector] Collected ${tableDef.modelName}: ${records.length} record(s)`,
    );

    return {
      tableDef,
      records: formattedRecords,
      recordCount: records.length,
    };
  }

  /**
   * Collect records directly via identityId/userField.
   */
  private async collectDirectRecords(
    tableDef: GdprExportTableDef,
    identityId: string,
    exportFields: GdprExportFieldDef[],
  ): Promise<Record<string, unknown>[]> {
    const select = buildPrismaSelect(exportFields);
    const where = { [tableDef.userField]: identityId };

    // Use dynamic Prisma access with strict narrowing
    // Note: This is safe because we validate modelName against registry
    const modelName = this.toPrismaModelName(tableDef.modelName);

    // 1. Safe access via explicit narrowing
    const prismaClientUnknown: unknown = this.prisma;
    if (!this.isRecordObject(prismaClientUnknown)) {
      throw new Error('Invalid Prisma client shape');
    }
    const prismaClient = prismaClientUnknown;
    const model = prismaClient[modelName];

    // 2. Validate model shape
    if (!this.isValidFindManyModel(model)) {
      throw new Error(`Invalid model: ${tableDef.modelName} (accessing ${modelName})`);
    }

    return await model.findMany({ where, select });
  }

  /**
   * Collect nested records via parent relation.
   */
  private async collectNestedRecords(
    _tableDef: GdprExportTableDef,
    parentRelation: { parentModel: string; relation: string },
    identityId: string,
    exportFields: GdprExportFieldDef[],
  ): Promise<Record<string, unknown>[]> {
    // Find the parent table config
    const parentTable = GDPR_EXPORT_TABLES.find((t) => t.modelName === parentRelation.parentModel);
    if (!parentTable) {
      throw new Error(`Parent model not found: ${parentRelation.parentModel}`);
    }

    const select = buildPrismaSelect(exportFields);

    // Query parent with nested relation
    const modelName = this.toPrismaModelName(parentTable.modelName);

    // 1. Safe access via explicit narrowing
    const prismaClientUnknown: unknown = this.prisma;
    if (!this.isRecordObject(prismaClientUnknown)) {
      throw new Error('Invalid Prisma client shape');
    }
    const prismaClient = prismaClientUnknown;
    const model = prismaClient[modelName];

    // 2. Validate model shape
    if (!this.isValidFindFirstModel(model)) {
      throw new Error(`Invalid parent model: ${parentTable.modelName} (accessing ${modelName})`);
    }

    const parent = await model.findFirst({
      where: { [parentTable.userField]: identityId },
      select: { [parentRelation.relation]: { select } },
    });

    if (!parent) {
      return [];
    }

    return (parent[parentRelation.relation] as Record<string, unknown>[]) ?? [];
  }

  /**
   * Format a raw record into display-ready fields.
   */
  private formatRecord(
    raw: Record<string, unknown>,
    exportFields: GdprExportFieldDef[],
    locale: string,
  ): DynamicCollectedRecord {
    const formatted = exportFields
      .filter((f) => f.include !== false)
      .map((fieldDef) => ({
        field: fieldDef.field,
        label: fieldDef.label,
        value: formatFieldValue(raw[fieldDef.field], fieldDef, locale),
        explanation: fieldDef.explanation,
      }));

    return { raw, formatted };
  }

  /**
   * Convert PascalCase model name to camelCase for Prisma access.
   * @example 'UserNotificationProfile' -> 'userNotificationProfile'
   */
  private toPrismaModelName(modelName: string): string {
    return modelName.charAt(0).toLowerCase() + modelName.slice(1);
  }

  private isRecordObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  /**
   * Type guard for Prisma model with findMany
   */
  private isValidFindManyModel(model: unknown): model is {
    findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  } {
    return typeof model === 'object' && model !== null && 'findMany' in model;
  }

  /**
   * Type guard for Prisma model with findFirst
   */
  private isValidFindFirstModel(model: unknown): model is {
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  } {
    return typeof model === 'object' && model !== null && 'findFirst' in model;
  }
}
