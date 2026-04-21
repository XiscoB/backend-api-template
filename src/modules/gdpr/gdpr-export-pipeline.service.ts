import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GdprAuditAction, Prisma } from '@prisma/client';
import { GdprExportDocument } from './gdpr-export-document.types';
import { GdprHtmlRenderer } from './gdpr-html-renderer.service';
import { GdprExportPackager, PackagedExport } from './gdpr-export-packager.service';
import {
  GdprExportStorage,
  GdprExportStorageResult,
  GDPR_EXPORT_STORAGE,
} from './gdpr-export-storage.interface';

/**
 * GDPR Export Pipeline Orchestrator (Phase 4)
 *
 * Orchestrates the complete export pipeline:
 * 1. Render document to HTML
 * 2. Package HTML into ZIP
 * 3. Store ZIP securely
 * 4. Persist export metadata
 * 5. Emit audit logs
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Atomic operation**: Either all steps succeed, or we fail cleanly.
 *    No partial success. No orphaned files.
 *
 * 2. **Separation of concerns**:
 *    - Renderer knows HTML
 *    - Packager knows ZIP
 *    - Storage knows files
 *    - Orchestrator coordinates
 *
 * 3. **Audit trail**: Every step is logged. Failures are traceable.
 *
 * 4. **Cleanup on failure**: If storage fails, we don't leave orphaned data.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PIPELINE STAGES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Stage 1: RENDER
 * - Input: GdprExportDocument
 * - Output: HTML string
 * - Audit: EXPORT_RENDERED
 *
 * Stage 2: PACKAGE
 * - Input: HTML string
 * - Output: ZIP buffer
 * - Audit: EXPORT_PACKAGED
 *
 * Stage 3: STORE
 * - Input: ZIP buffer
 * - Output: Storage key
 * - Audit: EXPORT_STORED
 *
 * Stage 4: COMPLETE
 * - Update request status
 * - Persist export metadata
 * - Audit: EXPORT_COMPLETED
 *
 * On any failure:
 * - Update request status to FAILED
 * - Cleanup any stored files
 * - Audit: EXPORT_FAILED
 */

/**
 * Export metadata persisted with the request.
 *
 * Stored in Request.dataPayload as JSON.
 */
export interface ExportMetadata {
  /** Storage key for retrieving the file */
  storageKey: string;

  /** Original filename (for download) */
  filename: string;

  /** File size in bytes */
  fileSize: number;

  /** SHA-256 checksum */
  checksum?: string;

  /** When the export was generated */
  generatedAt: string;

  /** When the export expires */
  expiresAt: string;

  /** Schema version used */
  schemaVersion: string;

  /** User's language */
  language: string;
}

/**
 * Result of the export pipeline.
 */
export interface ExportPipelineResult {
  /** Whether the export succeeded */
  success: boolean;

  /** Storage key (if successful) */
  storageKey?: string;

  /** Filename (if successful) */
  filename?: string;

  /** File size in bytes (if successful) */
  fileSize?: number;

  /** Storage provider type */
  storageProvider?: string;

  /** File checksum */
  checksum?: string;

  /** Expiration timestamp */
  expiresAt?: Date;

  /** Error message (if failed) */
  error?: string;

  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Pipeline options.
 */
export interface ExportPipelineOptions {
  /** Request ID */
  requestId: string;

  /** Identity ID */
  identityId: string;

  /** Export expiration in days (default: 7) */
  expirationDays?: number;
}

@Injectable()
export class GdprExportPipelineService {
  private readonly logger = new Logger(GdprExportPipelineService.name);

  /** Default export expiration in days */
  private readonly defaultExpirationDays = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly htmlRenderer: GdprHtmlRenderer,
    private readonly packager: GdprExportPackager,
    @Inject(GDPR_EXPORT_STORAGE)
    private readonly storage: GdprExportStorage,
  ) {}

  /**
   * Helper to ensure JSON safety for Prisma inputs.
   * Strips non-serializable values and returns valid InputJsonValue.
   */
  private toPrismaJson(data: unknown): Prisma.InputJsonValue {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(JSON.stringify(data));
  }

  /**
   * Execute the complete export pipeline.
   *
   * @param document - The semantic export document from Phase 3.5
   * @param options - Pipeline options (request ID, identity ID)
   * @returns Pipeline result with storage key or error
   */
  async execute(
    document: GdprExportDocument,
    options: ExportPipelineOptions,
  ): Promise<ExportPipelineResult> {
    const startTime = Date.now();
    const { requestId, identityId } = options;

    this.logger.log(
      `[Pipeline] Starting export pipeline for request: ${requestId}, identity: ${identityId}`,
    );

    let storageResult: GdprExportStorageResult | null = null;
    let packagedExport: PackagedExport | null = null;

    try {
      // Stage 1: Render HTML
      const html = await this.executeRenderStage(document, requestId, identityId);

      // Stage 2: Package ZIP
      packagedExport = await this.executePackageStage(
        html,
        document.metadata,
        requestId,
        identityId,
      );

      // Stage 3: Store ZIP
      storageResult = await this.executeStoreStage(packagedExport, document.metadata, options);

      // Stage 4: Complete request
      await this.executeCompleteStage(storageResult, packagedExport, document.metadata, options);

      const duration = Date.now() - startTime;
      const expiresAt = new Date();
      expiresAt.setDate(
        expiresAt.getDate() + (options.expirationDays ?? this.defaultExpirationDays),
      );

      this.logger.log(
        `[Pipeline] Export pipeline completed: ${storageResult.storageKey} (${duration}ms)`,
      );

      return {
        success: true,
        storageKey: storageResult.storageKey,
        filename: packagedExport.filename,
        fileSize: packagedExport.size,
        storageProvider: storageResult.storageProvider,
        checksum: storageResult.checksum,
        expiresAt,
        durationMs: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`[Pipeline] Export pipeline failed: ${errorMessage}`);

      // Cleanup on failure
      if (storageResult) {
        await this.cleanupStorage(storageResult.storageKey);
      }

      // Mark request as failed
      await this.markRequestFailed(requestId, identityId, errorMessage);

      return {
        success: false,
        error: errorMessage,
        durationMs: duration,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Stage 1: Render HTML
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute the render stage.
   */
  private async executeRenderStage(
    document: GdprExportDocument,
    requestId: string,
    identityId: string,
  ): Promise<string> {
    this.logger.debug(`[Pipeline] Stage 1: Rendering HTML`);
    const stageStart = Date.now();

    const html = this.htmlRenderer.render(document);

    const stageDuration = Date.now() - stageStart;

    // Audit log
    await this.createAuditLog(identityId, GdprAuditAction.EXPORT_RENDERED, {
      requestId,
      htmlSize: html.length,
      durationMs: stageDuration,
    });

    this.logger.debug(`[Pipeline] Stage 1 complete: ${html.length} bytes (${stageDuration}ms)`);

    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Stage 2: Package ZIP
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute the package stage.
   */
  private async executePackageStage(
    html: string,
    metadata: GdprExportDocument['metadata'],
    requestId: string,
    identityId: string,
  ): Promise<PackagedExport> {
    this.logger.debug(`[Pipeline] Stage 2: Packaging ZIP`);
    const stageStart = Date.now();

    const packagedExport = await this.packager.package(html, {
      identityId,
      generatedAt: metadata.generatedAt,
    });

    const stageDuration = Date.now() - stageStart;

    // Audit log
    await this.createAuditLog(identityId, GdprAuditAction.EXPORT_PACKAGED, {
      requestId,
      filename: packagedExport.filename,
      fileSize: packagedExport.size,
      durationMs: stageDuration,
    });

    this.logger.debug(
      `[Pipeline] Stage 2 complete: ${packagedExport.filename} (${packagedExport.size} bytes, ${stageDuration}ms)`,
    );

    return packagedExport;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Stage 3: Store ZIP
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute the store stage.
   */
  private async executeStoreStage(
    packagedExport: PackagedExport,
    metadata: GdprExportDocument['metadata'],
    options: ExportPipelineOptions,
  ): Promise<GdprExportStorageResult> {
    this.logger.debug(`[Pipeline] Stage 3: Storing ZIP`);
    const stageStart = Date.now();

    const expirationDays = options.expirationDays ?? this.defaultExpirationDays;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    const storageResult = await this.storage.store(packagedExport.buffer, {
      identityId: options.identityId,
      requestId: options.requestId,
      filename: packagedExport.filename,
      mimeType: 'application/zip',
      generatedAt: metadata.generatedAt,
      expiresAt,
    });

    const stageDuration = Date.now() - stageStart;

    // Audit log
    await this.createAuditLog(options.identityId, GdprAuditAction.EXPORT_STORED, {
      requestId: options.requestId,
      storageKey: storageResult.storageKey,
      fileSize: storageResult.size,
      checksum: storageResult.checksum,
      expiresAt: expiresAt.toISOString(),
      durationMs: stageDuration,
    });

    this.logger.debug(
      `[Pipeline] Stage 3 complete: ${storageResult.storageKey} (${stageDuration}ms)`,
    );

    return storageResult;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Stage 4: Complete Request
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute the complete stage.
   */
  private async executeCompleteStage(
    storageResult: GdprExportStorageResult,
    packagedExport: PackagedExport,
    metadata: GdprExportDocument['metadata'],
    options: ExportPipelineOptions,
  ): Promise<void> {
    this.logger.debug(`[Pipeline] Stage 4: Completing request`);
    const stageStart = Date.now();

    const expirationDays = options.expirationDays ?? this.defaultExpirationDays;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Build export metadata
    const exportMetadata: ExportMetadata = {
      storageKey: storageResult.storageKey,
      filename: packagedExport.filename,
      fileSize: packagedExport.size,
      checksum: storageResult.checksum,
      generatedAt: metadata.generatedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      schemaVersion: metadata.schemaVersion,
      language: metadata.language,
    };

    // Update request status and persist metadata (guarded: PROCESSING -> COMPLETED)
    const completed = await this.prisma.request.updateMany({
      where: {
        id: options.requestId,
        status: 'PROCESSING',
      },
      data: {
        status: 'COMPLETED',
        processedAt: new Date(),
        expiresAt,
        dataPayload: this.toPrismaJson(exportMetadata),
        errorMessage: null,
      },
    });

    if (completed.count === 0) {
      this.logger.debug(
        `[Pipeline] Completion transition skipped for request ${options.requestId} (already transitioned elsewhere)`,
      );
      return;
    }

    const stageDuration = Date.now() - stageStart;

    // Audit log
    await this.createAuditLog(options.identityId, GdprAuditAction.EXPORT_COMPLETED, {
      requestId: options.requestId,
      storageKey: storageResult.storageKey,
      filename: packagedExport.filename,
      fileSize: packagedExport.size,
      expiresAt: expiresAt.toISOString(),
      durationMs: stageDuration,
    });

    this.logger.debug(`[Pipeline] Stage 4 complete (${stageDuration}ms)`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Failure Handling
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Mark request as failed.
   */
  private async markRequestFailed(
    requestId: string,
    identityId: string,
    errorMessage: string,
  ): Promise<void> {
    try {
      const failed = await this.prisma.request.updateMany({
        where: {
          id: requestId,
          status: 'PROCESSING',
        },
        data: {
          status: 'FAILED',
          processedAt: new Date(),
          errorMessage,
        },
      });

      if (failed.count === 0) {
        this.logger.debug(
          `[Pipeline] Failure transition skipped for request ${requestId} (already transitioned elsewhere)`,
        );
        return;
      }

      await this.createAuditLog(identityId, GdprAuditAction.EXPORT_FAILED, {
        requestId,
        error: errorMessage,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Pipeline] Failed to mark request as failed: ${errMsg}`);
    }
  }

  /**
   * Cleanup stored file on failure.
   */
  private async cleanupStorage(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
      this.logger.debug(`[Pipeline] Cleaned up storage: ${storageKey}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Pipeline] Failed to cleanup storage: ${errMsg}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Audit Logging
  // ═══════════════════════════════════════════════════════════════════════

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
          action: action,
          entityType: 'gdpr_export',
          metadata: this.toPrismaJson(metadata),
          performedBy: 'SYSTEM',
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Pipeline] Failed to create audit log: ${errMsg}`);
    }
  }
}
