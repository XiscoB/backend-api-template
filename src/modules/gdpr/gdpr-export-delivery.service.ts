import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { GdprAuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { GdprS3StorageAdapter, PresignedUrlResult } from './gdpr-s3-storage.adapter';
import { ExportMetadata } from './gdpr-export-pipeline.service';
import { GdprNotificationHooks } from './gdpr-notification-hooks.service';

/**
 * GDPR Export Delivery Service (Phase 5)
 *
 * Handles secure delivery of GDPR exports to authenticated users.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * RESPONSIBILITIES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Authorization**: Verify user owns the export
 * 2. **Expiry enforcement**: Check export hasn't expired
 * 3. **Presigned URL generation**: Create short-lived download URLs
 * 4. **Audit logging**: Track all download attempts
 * 5. **Cleanup**: Delete expired files (best effort)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURITY MODEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - Users can ONLY download their own exports
 * - ADMIN/SYSTEM roles do NOT have access (unless explicitly allowed)
 * - All access attempts are audited
 * - Presigned URLs are never stored or logged
 * - URLs expire quickly (5 minutes default)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ERROR HANDLING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - 403 Forbidden: Request belongs to different user
 * - 404 Not Found: Request doesn't exist or isn't COMPLETED
 * - 410 Gone: Export has expired
 * - 500 Internal: Storage or other system errors
 */

/**
 * Result of a download authorization check.
 */
export interface DownloadAuthorizationResult {
  /** Whether download is authorized */
  authorized: boolean;

  /** The presigned URL (if authorized) */
  downloadUrl?: string;

  /** When the URL expires */
  expiresAt?: Date;

  /** Original filename for Content-Disposition */
  filename?: string;

  /** File size for Content-Length hints */
  fileSize?: number;

  /** Error code if not authorized */
  errorCode?: 'FORBIDDEN' | 'NOT_FOUND' | 'EXPIRED' | 'NOT_READY';

  /** Human-readable error message */
  errorMessage?: string;
}

/**
 * Detailed export status for user queries.
 */
export interface ExportStatusResult {
  /** Request ID */
  requestId: string;

  /** Current status */
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

  /** When the request was created */
  createdAt: Date;

  /** When processing completed (if applicable) */
  completedAt?: Date;

  /** When the export expires (if completed) */
  expiresAt?: Date;

  /** Whether download is available */
  downloadAvailable: boolean;

  /** Error message (if failed) */
  errorMessage?: string;
}

@Injectable()
export class GdprExportDeliveryService {
  private readonly logger = new Logger(GdprExportDeliveryService.name);

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
    private readonly s3Storage: GdprS3StorageAdapter,
    private readonly identityService: IdentityService,
    @Optional()
    private readonly notificationHooks?: GdprNotificationHooks,
  ) {}

  /**
   * Authorize and generate a download URL for an export.
   *
   * This is the main entry point for the download endpoint.
   *
   * @param requestId - The GDPR request ID
   * @param externalUserId - The requesting user's external ID (from JWT sub)
   * @returns Authorization result with download URL or error
   */
  async authorizeDownload(
    requestId: string,
    externalUserId: string,
  ): Promise<DownloadAuthorizationResult> {
    // Resolve identity from external user ID
    const identity = await this.identityService.getIdentityByExternalUserId(externalUserId);
    if (!identity) {
      return {
        authorized: false,
        errorCode: 'FORBIDDEN',
        errorMessage: 'User identity not found',
      };
    }
    const identityId = identity.id;

    this.logger.debug(
      `[Delivery] Download requested: request=${requestId}, identity=${identityId}`,
    );

    // Audit: Download requested
    await this.createAuditLog(identityId, 'EXPORT_DOWNLOAD_REQUESTED', {
      requestId,
    });

    try {
      // Step 1: Fetch the request
      const request = await this.prisma.request.findUnique({
        where: { id: requestId },
        select: {
          id: true,
          identityId: true,
          requestType: true,
          status: true,
          dataPayload: true,
          expiresAt: true,
          processedAt: true,
        },
      });

      // Step 2: Check request exists
      if (!request) {
        this.logger.warn(`[Delivery] Request not found: ${requestId}`);
        return {
          authorized: false,
          errorCode: 'NOT_FOUND',
          errorMessage: 'Export request not found',
        };
      }

      // Step 3: Verify ownership (CRITICAL)
      if (request.identityId !== identityId) {
        this.logger.warn(
          `[Delivery] Ownership mismatch: request=${requestId}, ` +
            `owner=${request.identityId}, requester=${identityId}`,
        );
        // Audit: Forbidden access attempt
        await this.createAuditLog(identityId, 'EXPORT_DOWNLOAD_REQUESTED', {
          requestId,
          denied: true,
          reason: 'ownership_mismatch',
        });
        return {
          authorized: false,
          errorCode: 'FORBIDDEN',
          errorMessage: 'You do not have access to this export',
        };
      }

      // Step 4: Verify request type
      if (request.requestType !== 'GDPR_EXPORT') {
        return {
          authorized: false,
          errorCode: 'NOT_FOUND',
          errorMessage: 'Invalid request type for download',
        };
      }

      // Step 5: Check status is COMPLETED
      if (request.status !== 'COMPLETED') {
        if (request.status === 'FAILED') {
          return {
            authorized: false,
            errorCode: 'NOT_FOUND',
            errorMessage: 'Export generation failed',
          };
        }
        if (request.status === 'EXPIRED') {
          return {
            authorized: false,
            errorCode: 'EXPIRED',
            errorMessage: 'Export has expired and is no longer available',
          };
        }
        return {
          authorized: false,
          errorCode: 'NOT_READY',
          errorMessage: 'Export is still being processed',
        };
      }

      // Step 6: Check expiry
      const now = new Date();
      if (request.expiresAt && request.expiresAt < now) {
        this.logger.log(
          `[Delivery] Export expired: request=${requestId}, expired=${request.expiresAt.toISOString()}`,
        );

        // Handle expiry (update status, cleanup, audit)
        await this.handleExpiredExport(requestId, identityId, request.dataPayload);

        return {
          authorized: false,
          errorCode: 'EXPIRED',
          errorMessage: 'Export has expired and is no longer available',
        };
      }

      // Step 7: Extract export metadata
      if (!this.isExportMetadata(request.dataPayload)) {
        this.logger.error(`[Delivery] Missing storage key: request=${requestId}`);
        return {
          authorized: false,
          errorCode: 'NOT_FOUND',
          errorMessage: 'Export file information is missing',
        };
      }
      const exportMetadata = request.dataPayload;

      // Step 8: Generate presigned URL
      const presignedResult = await this.generateDownloadUrl(exportMetadata.storageKey);

      // Step 9: Update download metrics (Phase 6)
      await this.updateDownloadMetrics(requestId);

      // Audit: Download granted
      await this.createAuditLog(identityId, 'EXPORT_DOWNLOAD_GRANTED', {
        requestId,
        filename: exportMetadata.filename,
        fileSize: exportMetadata.fileSize,
        urlExpiresAt: presignedResult.expiresAt.toISOString(),
      });

      this.logger.log(
        `[Delivery] Download authorized: request=${requestId}, file=${exportMetadata.filename}`,
      );

      return {
        authorized: true,
        downloadUrl: presignedResult.url,
        expiresAt: presignedResult.expiresAt,
        filename: exportMetadata.filename,
        fileSize: exportMetadata.fileSize,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Delivery] Error processing download: ${errMsg}`);
      throw error;
    }
  }

  /**
   * Get the status of an export request.
   *
   * @param requestId - The GDPR request ID
   * @param externalUserId - The requesting user's external ID (from JWT sub)
   * @returns Export status
   */
  async getExportStatus(requestId: string, externalUserId: string): Promise<ExportStatusResult> {
    // Resolve identity from external user ID
    const identity = await this.identityService.getIdentityByExternalUserId(externalUserId);
    if (!identity) {
      throw new NotFoundException('User identity not found');
    }
    const identityId = identity.id;

    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        identityId: true,
        requestType: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        processedAt: true,
        expiresAt: true,
      },
    });

    if (!request) {
      throw new NotFoundException('Export request not found');
    }

    if (request.identityId !== identityId) {
      throw new ForbiddenException('You do not have access to this export');
    }

    if (request.requestType !== 'GDPR_EXPORT') {
      throw new NotFoundException('Invalid request type');
    }

    // Check if expired
    const now = new Date();
    const isExpired = request.expiresAt && request.expiresAt < now;
    const effectiveStatus = isExpired ? 'EXPIRED' : request.status;

    return {
      requestId: request.id,
      status: effectiveStatus as ExportStatusResult['status'],
      createdAt: request.createdAt,
      completedAt: request.processedAt ?? undefined,
      expiresAt: request.expiresAt ?? undefined,
      downloadAvailable: effectiveStatus === 'COMPLETED',
      errorMessage: request.errorMessage ?? undefined,
    };
  }

  /**
   * Handle an expired export.
   *
   * - Updates request status to EXPIRED
   * - Deletes file from storage (best effort)
   * - Creates audit log
   */
  private async handleExpiredExport(
    requestId: string,
    identityId: string,
    dataPayload: unknown,
  ): Promise<void> {
    try {
      // Update status to EXPIRED (guarded: COMPLETED -> EXPIRED)
      const expired = await this.prisma.request.updateMany({
        where: {
          id: requestId,
          status: 'COMPLETED',
        },
        data: { status: 'EXPIRED' },
      });

      if (expired.count === 0) {
        this.logger.debug(
          `[Delivery] Expiration transition skipped for request ${requestId} (already transitioned elsewhere)`,
        );
        return;
      }

      // Audit: Export expired
      await this.createAuditLog(identityId, 'EXPORT_EXPIRED', {
        requestId,
      });

      // Notify user (non-blocking) - user may want to request a new export
      this.notificationHooks?.onExportExpired(identityId, { requestId }).catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`[Delivery] Failed to send expired notification: ${errMsg}`);
      });

      // Best-effort file deletion
      if (this.isExportMetadata(dataPayload)) {
        const metadata = dataPayload;
        try {
          const deleted = await this.s3Storage.delete(metadata.storageKey);
          if (deleted) {
            // Audit: File deleted
            await this.createAuditLog(identityId, 'EXPORT_DELETED', {
              requestId,
              storageKey: metadata.storageKey,
              reason: 'expired',
            });
            this.logger.log(`[Delivery] Deleted expired file: ${metadata.storageKey}`);
          }
        } catch (deleteError) {
          const deleteErrMsg =
            deleteError instanceof Error ? deleteError.message : String(deleteError);
          this.logger.warn(`[Delivery] Failed to delete expired file: ${deleteErrMsg}`);
          // Continue - expiry handling succeeded even if cleanup failed
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Delivery] Failed to handle expired export: ${errMsg}`);
      // Don't throw - caller should still get EXPIRED response
    }
  }

  /**
   * Generate a presigned URL for download.
   */
  private async generateDownloadUrl(storageKey: string): Promise<PresignedUrlResult> {
    try {
      return await this.s3Storage.generatePresignedUrl(storageKey);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Delivery] Failed to generate presigned URL: ${errMsg}`);
      throw new Error('Failed to generate download URL');
    }
  }

  /**
   * Update download metrics for a request (Phase 6).
   *
   * Increments downloadCount and sets lastDownloadedAt.
   * This is called after successful download authorization.
   *
   * NOTE: We do NOT track IP addresses, user agents, or other
   * identifying information. Just the count and timestamp.
   */
  private async updateDownloadMetrics(requestId: string): Promise<void> {
    try {
      await this.prisma.request.update({
        where: { id: requestId },
        data: {
          downloadCount: { increment: 1 },
          lastDownloadedAt: new Date(),
        },
      });
      this.logger.debug(`[Delivery] Updated download metrics: request=${requestId}`);
    } catch (error) {
      // Log but don't fail - metrics are nice-to-have, not critical
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Delivery] Failed to update download metrics: ${errMsg}`);
    }
  }

  /**
   * Create an audit log entry.
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
          performedBy: identityId, // Self-service action
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Delivery] Failed to create audit log: ${errMsg}`);
    }
  }
}
