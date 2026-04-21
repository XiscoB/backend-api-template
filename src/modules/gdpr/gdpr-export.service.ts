import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { Request, GdprAuditAction, RequestType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GdprRepository } from './gdpr.repository';
import { IdentityService } from '../identity/identity.service';
import { getExportableTables, GdprTableConfig } from './gdpr.registry';

/**
 * Collected data from a single table during export.
 */
interface TableExportData {
  tableName: string;
  modelName: string;
  recordCount: number;
  records: Record<string, unknown>[];
}

/**
 * Result of a GDPR data export operation.
 */
export interface GdprExportResult {
  identityId: string;
  exportedAt: Date;
  tables: TableExportData[];
  totalRecords: number;
}

/**
 * GDPR Export Service
 *
 * Handles GDPR data export operations.
 * This service is version-agnostic and can be used by multiple API versions.
 *
 * IMPORTANT: This service resolves Identity at the boundary, then operates
 * on identityId internally.
 *
 * v1 Scope:
 * - Request initiation (creates Request row)
 * - Background processing (collects data, writes audit log)
 * - No storage of export data (product-specific concern)
 * - No delivery mechanism (product-specific concern)
 *
 * Extension points for products:
 * - Override/extend processExportRequest to add storage
 * - Add delivery mechanism (email, S3, etc.)
 * - Add status checking endpoints
 */
@Injectable()
export class GdprExportService {
  private readonly logger = new Logger(GdprExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gdprRepository: GdprRepository,
    private readonly identityService: IdentityService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Public API - Used by Controllers
  // ─────────────────────────────────────────────────────────────

  /**
   * Request a GDPR data export.
   *
   * Creates a PENDING request that will be processed by a background worker.
   * Only one pending/processing export request per identity is allowed.
   *
   * @param externalUserId - The user ID from JWT sub claim
   * @returns The created request
   * @throws ConflictException if user already has a pending export request
   */
  async requestExport(externalUserId: string): Promise<Request> {
    this.logger.log(`Export requested for user: ${externalUserId}`);

    // Resolve Identity at the boundary
    const identity = await this.identityService.resolveIdentity(externalUserId);

    // Check for existing pending request
    const hasPending = await this.gdprRepository.hasPendingRequest(
      identity.id,
      RequestType.GDPR_EXPORT,
    );
    if (hasPending) {
      throw new ConflictException(
        'An export request is already pending or processing. Please wait for it to complete.',
      );
    }

    // Create the request
    const request = await this.gdprRepository.createRequest({
      identityId: identity.id,
      requestType: RequestType.GDPR_EXPORT,
    });

    // Audit log: export requested
    await this.gdprRepository.createAuditLog({
      identityId: identity.id,
      action: GdprAuditAction.EXPORT_REQUESTED,
      metadata: { requestId: request.id },
      performedBy: identity.id, // Self-service action
    });

    this.logger.log(`Export request created: ${request.id}`);
    return request;
  }

  // ─────────────────────────────────────────────────────────────
  // Cron-Compatible Methods - Used by Background Workers
  // ─────────────────────────────────────────────────────────────

  /**
   * Process pending export requests.
   *
   * This method is designed to be called by a cron job or background worker.
   * It processes one request at a time to avoid overwhelming the database.
   *
   * @param limit - Maximum number of requests to process in this batch
   * @returns Number of requests processed
   */
  async processPendingExports(limit: number = 10): Promise<number> {
    const claimedRequests = await this.gdprRepository.claimPendingRequestsForProcessing(
      RequestType.GDPR_EXPORT,
      limit,
    );
    let processed = 0;

    for (const request of claimedRequests) {
      try {
        await this.processExportRequest(request);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to process export request ${request.id}: ${errorMessage}`);
        // Error is already logged in processExportRequest, continue to next
      }
    }

    if (processed > 0) {
      this.logger.log(`Processed ${processed} export requests`);
    }

    return processed;
  }

  // ─────────────────────────────────────────────────────────────
  // Internal Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Process a single export request.
   *
   * Collects data from all registered tables.
   * In v1, the data is logged but NOT stored (no delivery mechanism).
   *
   * Products extending this should:
   * - Store the export result (S3, database, etc.)
   * - Implement delivery (email, download link, etc.)
   */
  private async processExportRequest(request: Request): Promise<void> {
    const { id, identityId } = request;

    this.logger.log(`Processing export request: ${id}`);

    // Audit log: export started
    await this.gdprRepository.createAuditLog({
      identityId,
      action: GdprAuditAction.EXPORT_STARTED,
      metadata: { requestId: id },
      performedBy: 'SYSTEM',
    });

    try {
      // Collect data from all exportable tables
      const exportResult = await this.collectUserData(identityId);

      // Mark as completed
      // Note: v1 does NOT store the export data - products should extend this
      const completed = await this.gdprRepository.markRequestCompleted(id);
      if (!completed) {
        this.logger.debug(
          `Completion transition skipped for export request ${id} (already transitioned elsewhere)`,
        );
        return;
      }

      // Audit log: export completed
      await this.gdprRepository.createAuditLog({
        identityId,
        action: GdprAuditAction.EXPORT_COMPLETED,
        metadata: {
          requestId: id,
          tableCount: exportResult.tables.length,
          totalRecords: exportResult.totalRecords,
        },
        performedBy: 'SYSTEM',
      });

      this.logger.log(
        `Export completed: ${id} (${exportResult.totalRecords} records from ${exportResult.tables.length} tables)`,
      );

      // TODO: Product-specific extension point
      // await this.deliverExport(identityId, exportResult);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as failed
      const failed = await this.gdprRepository.markRequestFailed(id, errorMessage);
      if (!failed) {
        this.logger.debug(
          `Failure transition skipped for export request ${id} (already transitioned elsewhere)`,
        );
        return;
      }

      // Audit log: export failed
      await this.gdprRepository.createAuditLog({
        identityId,
        action: GdprAuditAction.EXPORT_FAILED,
        metadata: { requestId: id, error: errorMessage },
        performedBy: 'SYSTEM',
      });

      this.logger.error(`Export failed: ${id} - ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Collect all user data from registered tables.
   *
   * Iterates through the GDPR registry and exports data from each table
   * where export: true.
   */
  private async collectUserData(identityId: string): Promise<GdprExportResult> {
    const exportableTables = getExportableTables();
    const tables: TableExportData[] = [];
    let totalRecords = 0;

    for (const tableConfig of exportableTables) {
      const tableExport = await this.exportTable(tableConfig, identityId);
      tables.push(tableExport);
      totalRecords += tableExport.recordCount;
    }

    return {
      identityId,
      exportedAt: new Date(),
      tables,
      totalRecords,
    };
  }

  /**
   * Export data from a single table.
   *
   * Uses dynamic Prisma access based on model name.
   * The userField from registry (identityId) is used to filter by owner.
   */
  private async exportTable(config: GdprTableConfig, identityId: string): Promise<TableExportData> {
    const { modelName, tableName, userField } = config;

    // Dynamic Prisma model access
    // We use type assertion because Prisma client types don't support dynamic access
    const prismaModelKey = modelName.charAt(0).toLowerCase() + modelName.slice(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const prismaModel = (this.prisma as any)[prismaModelKey] as
      | {
          findMany: (args: { where: Record<string, string> }) => Promise<Record<string, unknown>[]>;
        }
      | undefined;

    if (!prismaModel || typeof prismaModel.findMany !== 'function') {
      this.logger.warn(`Model ${modelName} not found in Prisma client`);
      return {
        tableName,
        modelName,
        recordCount: 0,
        records: [],
      };
    }

    // Query the table for user's data using identityId
    const records = await prismaModel.findMany({
      where: { [userField]: identityId },
    });

    this.logger.debug(`Exported ${records.length} records from ${tableName}`);

    return {
      tableName,
      modelName,
      recordCount: records.length,
      records,
    };
  }
}
