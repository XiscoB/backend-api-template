import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { GdprAuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GdprExportStorage, GDPR_EXPORT_STORAGE } from './gdpr-export-storage.interface';
import { ExportMetadata } from './gdpr-export-pipeline.service';
import { GdprNotificationHooks } from './gdpr-notification-hooks.service';
import { GdprRepository } from './gdpr.repository';

/**
 * GDPR Export Cleanup Service (Phase 6)
 *
 * Handles background cleanup of expired GDPR exports.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GDPR requires that personal data be deleted when no longer necessary.
 * Exports have a limited lifespan (default 7 days) after which:
 * - The file MUST be deleted from storage
 * - The request status MUST be updated to EXPIRED
 * - An audit log MUST be created
 *
 * This service ensures cleanup happens even if users never request download.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Idempotent**: Safe to run multiple times. Re-running on already-expired
 *    requests does nothing (they're already cleaned up).
 *
 * 2. **Fault-tolerant**: If one deletion fails, continue with others.
 *    Failures are logged but don't crash the job.
 *
 * 3. **Batch processing**: Processes in configurable batches to avoid
 *    overwhelming the database or storage.
 *
 * 4. **Audit trail**: Every deletion creates an audit log entry.
 *    This is REQUIRED for GDPR compliance.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service is designed to be called from:
 * - External cron jobs (Kubernetes CronJob, AWS EventBridge, etc.)
 * - The GdprCronService (which wraps this for convenience)
 *
 * Recommended schedule: Once daily (e.g., 02:00 UTC)
 *
 * Example:
 * ```typescript
 * // In GdprCronService or external scheduler
 * const result = await cleanupService.cleanupExpiredExports();
 * console.log(`Cleaned up ${result.deleted} exports`);
 * ```
 */

/**
 * Result of a cleanup run.
 */
export interface CleanupResult {
  /** Number of exports processed */
  processed: number;

  /** Number of exports successfully deleted */
  deleted: number;

  /** Number of exports that failed to delete */
  failed: number;

  /** Duration in milliseconds */
  durationMs: number;

  /** Error messages for failed deletions */
  errors: string[];
}

@Injectable()
export class GdprExportCleanupService {
  private readonly logger = new Logger(GdprExportCleanupService.name);

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private isExportMetadata(value: unknown): value is ExportMetadata {
    if (!this.isRecord(value)) {
      return false;
    }

    return (
      typeof value['storageKey'] === 'string' &&
      typeof value['filename'] === 'string' &&
      typeof value['fileSize'] === 'number' &&
      typeof value['generatedAt'] === 'string' &&
      typeof value['expiresAt'] === 'string' &&
      typeof value['schemaVersion'] === 'string' &&
      typeof value['language'] === 'string'
    );
  }

  private toInputJsonValue(data: Record<string, unknown>): Prisma.InputJsonValue {
    const serialized = JSON.stringify(data);
    const parsed: unknown = JSON.parse(serialized);
    return parsed as Prisma.InputJsonValue;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly gdprRepository: GdprRepository,
    @Inject(GDPR_EXPORT_STORAGE)
    private readonly storage: GdprExportStorage,
    @Optional()
    private readonly notificationHooks?: GdprNotificationHooks,
  ) {}

  /**
   * Clean up all expired GDPR exports.
   *
   * Finds exports where:
   * - status = COMPLETED
   * - expiresAt < now
   *
   * For each:
   * - Deletes the file from storage
   * - Updates status to EXPIRED
   * - Creates audit log
   *
   * @param batchSize - Number of exports to process per run (default: 100)
   * @returns Cleanup result with statistics
   */
  async cleanupExpiredExports(batchSize: number = 100): Promise<CleanupResult> {
    const startTime = Date.now();

    this.logger.log('[Cleanup] Starting expired export cleanup...');

    // Find expired exports that haven't been cleaned up yet
    const expiredExports = await this.prisma.request.findMany({
      where: {
        requestType: 'GDPR_EXPORT',
        status: 'COMPLETED',
        expiresAt: {
          lt: new Date(),
        },
      },
      select: {
        id: true,
        identityId: true,
        dataPayload: true,
        expiresAt: true,
      },
      take: batchSize,
      orderBy: {
        expiresAt: 'asc', // Process oldest first
      },
    });

    if (expiredExports.length === 0) {
      this.logger.debug('[Cleanup] No expired exports to clean up');
      return {
        processed: 0,
        deleted: 0,
        failed: 0,
        durationMs: Date.now() - startTime,
        errors: [],
      };
    }

    this.logger.log(`[Cleanup] Found ${expiredExports.length} expired exports to clean up`);

    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process each export individually (fault-tolerant)
    for (const request of expiredExports) {
      try {
        await this.cleanupSingleExport(request);
        deleted++;
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Request ${request.id}: ${errorMessage}`);
        this.logger.error(`[Cleanup] Failed to cleanup request ${request.id}: ${errorMessage}`);
        // Continue with next export - don't fail the entire job
      }
    }

    const durationMs = Date.now() - startTime;

    this.logger.log(`[Cleanup] Completed: ${deleted} deleted, ${failed} failed (${durationMs}ms)`);

    return {
      processed: expiredExports.length,
      deleted,
      failed,
      durationMs,
      errors,
    };
  }

  /**
   * Clean up a single expired export.
   */
  private async cleanupSingleExport(request: {
    id: string;
    identityId: string;
    dataPayload: unknown;
    expiresAt: Date | null;
  }): Promise<void> {
    const metadata = this.isExportMetadata(request.dataPayload) ? request.dataPayload : null;

    // Step 1: Delete file from storage (if exists)
    if (metadata?.storageKey) {
      try {
        const fileDeleted = await this.storage.delete(metadata.storageKey);
        if (fileDeleted) {
          this.logger.debug(`[Cleanup] Deleted file: ${metadata.storageKey}`);
        } else {
          this.logger.debug(`[Cleanup] File already deleted: ${metadata.storageKey}`);
        }
      } catch (storageError) {
        // Log but continue - file might already be deleted by S3 lifecycle
        const storageErrMsg =
          storageError instanceof Error ? storageError.message : String(storageError);
        this.logger.warn(`[Cleanup] Storage deletion failed (continuing): ${storageErrMsg}`);
      }
    }

    // Step 2: Update request status to EXPIRED (guarded: COMPLETED -> EXPIRED)
    const expired = await this.gdprRepository.markRequestExpired(request.id);
    if (!expired) {
      this.logger.debug(
        `[Cleanup] Expiration transition skipped for request ${request.id} (already transitioned elsewhere)`,
      );
      return;
    }

    // Step 3: Create audit log
    await this.createAuditLog(request.identityId, 'EXPORT_DELETED', {
      requestId: request.id,
      reason: 'expired',
      expiredAt: request.expiresAt?.toISOString(),
      storageKey: metadata?.storageKey ?? null,
      cleanedUpBy: 'SYSTEM',
    });

    // Step 4: Notify user (Phase 7, non-blocking)
    if (this.notificationHooks) {
      this.notificationHooks
        .onExportDeleted(request.identityId, {
          requestId: request.id,
          reason: 'Export exceeded retention period and was automatically deleted',
        })
        .catch((err) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[Cleanup] Notification hook failed (non-blocking): ${errMsg}`);
        });
    }

    this.logger.debug(`[Cleanup] Cleaned up request: ${request.id}`);
  }

  /**
   * Create an audit log entry.
   *
   * NOTE: Audit logging is REQUIRED for GDPR compliance.
   * Every data deletion must be recorded.
   */
  private async createAuditLog(
    identityId: string,
    action: GdprAuditAction,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.gdprAuditLog.create({
        data: {
          identityId,
          action,
          entityType: 'gdpr_export',
          metadata: this.toInputJsonValue(metadata),
          performedBy: 'SYSTEM',
        },
      });
    } catch (err) {
      // Log but don't fail - audit log failure shouldn't block cleanup
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Cleanup] Failed to create audit log: ${errMsg}`);
    }
  }

  /**
   * Get count of expired exports pending cleanup.
   *
   * Useful for monitoring/alerting.
   */
  async getExpiredExportCount(): Promise<number> {
    return await this.prisma.request.count({
      where: {
        requestType: 'GDPR_EXPORT',
        status: 'COMPLETED',
        expiresAt: {
          lt: new Date(),
        },
      },
    });
  }
}
