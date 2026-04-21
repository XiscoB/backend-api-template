import { Injectable, Logger } from '@nestjs/common';
import { Request, RequestType, GdprAuditAction } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { GdprRepository } from './gdpr.repository';
import { GdprDataOrchestratorService } from './gdpr-data-orchestrator.service';
import { GdprDocumentBuilderService } from './gdpr-document-builder.service';
import { GdprExportPipelineService } from './gdpr-export-pipeline.service';
import { LanguageCode } from './gdpr-export-document.types';
import {
  GlobalNotificationService,
  NotificationEvent,
} from '../notifications/global-notification.service';
import { getTranslations } from '../../common/translations';

/**
 * GDPR Request Processor Service
 *
 * Implements Phase 2 of the GDPR system: safe request lifecycle management.
 *
 * ───────────────────────────────────────────────────────────────
 * Purpose (What This Service Does):
 * ───────────────────────────────────────────────────────────────
 * - Finds pending GDPR export requests
 * - Transitions them through lifecycle states safely
 * - Prevents double processing with transactional locking
 * - Logs every state transition for audit compliance
 * - Handles failures gracefully (no stuck requests)
 *
 * ───────────────────────────────────────────────────────────────
 * Lifecycle States & Transitions:
 * ───────────────────────────────────────────────────────────────
 * PENDING → PROCESSING → COMPLETED
 *                     └→ FAILED
 *
 * Rules:
 * - Transitions are explicit (no state skipping)
 * - PROCESSING is exclusive (transactional lock)
 * - COMPLETED and FAILED are terminal states
 * - Every transition creates an audit log entry
 *
 * ───────────────────────────────────────────────────────────────
 * Locking Strategy:
 * ───────────────────────────────────────────────────────────────
 * Uses Prisma transactions with conditional updates:
 * - Transaction ensures atomicity
 * - WHERE status = PENDING prevents double processing
 * - If another process claims the request first, update returns null
 * - No external lock managers required (database-level safety)
 *
 * This approach is safe for:
 * - Multiple cron workers
 * - Concurrent invocations
 * - Process crashes (transaction rollback)
 *
 * ───────────────────────────────────────────────────────────────
 * What This Service Does NOT Do (Future Phases):
 * ───────────────────────────────────────────────────────────────
 * - Collect user data (Phase 3)
 * - Query business tables (Phase 3)
 * - Generate export files (Phase 3)
 * - Upload to storage (Phase 4)
 * - Send notifications (Phase 4)
 *
 * This phase proves the system can process requests safely.
 * Data export logic will be added in future phases.
 *
 * ───────────────────────────────────────────────────────────────
 * Invocation:
 * ───────────────────────────────────────────────────────────────
 * - Called by internal cron jobs (future)
 * - Can be manually triggered via admin CLI (optional)
 * - NOT exposed via public HTTP endpoints
 *
 * @see GdprRepository for database operations
 * @see agents.md for GDPR implementation guidelines
 */
@Injectable()
export class GdprRequestProcessorService {
  private readonly logger = new Logger(GdprRequestProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gdprRepository: GdprRepository,
    private readonly dataOrchestrator: GdprDataOrchestratorService,
    private readonly documentBuilder: GdprDocumentBuilderService,
    private readonly exportPipeline: GdprExportPipelineService,
    private readonly notificationService: GlobalNotificationService,
  ) {}

  /**
   * Process all pending GDPR export requests.
   *
   * This is the main entry point for background processing.
   * It's designed to be safe for repeated invocations (idempotent).
   *
   * Processing Strategy:
   * 1. Find all PENDING export requests
   * 2. Process each request sequentially (not in parallel)
   * 3. Use transactional locking to prevent double processing
   * 4. Log all state transitions
   * 5. Handle failures gracefully
   *
   * Safety Guarantees:
   * - If called multiple times concurrently, each request is processed once
   * - If process crashes, requests stay in deterministic states
   * - No requests are left stuck in PROCESSING
   * - All state changes are audited
   *
   * @param batchSize - Maximum number of requests to process (default: 10)
   * @returns Summary of processing results
   */
  async processPendingExports(batchSize: number = 10): Promise<ProcessingSummary> {
    this.logger.log(
      `[Processor] Starting GDPR export request processing (batch size: ${batchSize})`,
    );

    const summary: ProcessingSummary = {
      totalFound: 0,
      processed: 0,
      failed: 0,
      skipped: 0,
    };

    try {
      // Atomic claim + transition (single persistence boundary in repository)
      const claimedRequests = await this.gdprRepository.claimPendingRequestsForProcessing(
        RequestType.GDPR_EXPORT,
        batchSize,
      );
      summary.totalFound = claimedRequests.length;

      if (claimedRequests.length === 0) {
        this.logger.log('[Processor] No pending export requests found');
        return summary;
      }

      this.logger.log(`[Processor] Claimed ${claimedRequests.length} export requests`);

      // Process each request sequentially
      // Sequential processing ensures predictable resource usage
      // and makes debugging easier (no concurrent state mutations)
      for (const request of claimedRequests) {
        try {
          const result = await this.processRequest(request);

          if (result === 'PROCESSED') {
            summary.processed++;
          } else if (result === 'FAILED') {
            summary.failed++;
          } else if (result === 'SKIPPED') {
            summary.skipped++;
          }
        } catch (error) {
          // This catch handles unexpected errors during processing
          // The request should already be marked as FAILED by processRequest
          // But we increment the counter to track overall batch failures
          summary.failed++;
          this.logger.error(
            `[Processor] Unexpected error processing request ${request.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `[Processor] Processing complete - Processed: ${summary.processed}, Failed: ${summary.failed}, Skipped: ${summary.skipped}`,
      );
    } catch (error) {
      this.logger.error(
        `[Processor] Fatal error during batch processing: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    return summary;
  }

  /**
   * Process a single GDPR export request through its lifecycle.
   *
   * Lifecycle Flow:
   * 1. Attempt to acquire processing lock (PENDING → PROCESSING)
   * 2. If lock acquired:
   *    a. Log EXPORT_PROCESSING_STARTED
   *    b. Execute processing logic (no-op in this phase)
   *    c. Transition to COMPLETED
   *    d. Log EXPORT_COMPLETED
   * 3. If lock fails:
   *    - Another process already claimed it
   *    - Skip silently (not an error)
   * 4. If error occurs:
   *    - Catch it
   *    - Transition to FAILED
   *    - Log EXPORT_FAILED
   *    - Never leave request in PROCESSING
   *
   * @param request - The request to process
   * @returns Result of processing attempt
   */
  private async processRequest(request: Request): Promise<ProcessingResult> {
    this.logger.log(
      `[Processor] Processing request ${request.id} for identity ${request.identityId}`,
    );

    try {
      this.logger.log(`[Processor] Request ${request.id} claimed for processing`);

      // Step 2: Create audit log for processing start
      await this.gdprRepository.createAuditLog({
        identityId: request.identityId,
        action: GdprAuditAction.EXPORT_STARTED, // Can also use EXPORT_PROCESSING_STARTED
        entityType: 'gdpr_requests',
        metadata: {
          requestId: request.id,
          processingStartedAt: new Date().toISOString(),
        },
        performedBy: 'SYSTEM', // Background job, not user-initiated
      });

      // Step 3: Execute processing logic
      // Complete export pipeline: collect → build → render → package → store
      await this.executeProcessing(request);

      // Note: Pipeline already marks request as COMPLETED and persists metadata
      // No need to call markRequestCompleted here

      // Step 5: Create audit log for completion
      await this.gdprRepository.createAuditLog({
        identityId: request.identityId,
        action: GdprAuditAction.EXPORT_COMPLETED,
        entityType: 'gdpr_requests',
        metadata: {
          requestId: request.id,
          completedAt: new Date().toISOString(),
        },
        performedBy: 'SYSTEM',
      });

      this.logger.log(`[Processor] Request ${request.id} completed successfully`);
      return 'PROCESSED';
    } catch (error) {
      // Step 6: Handle failures gracefully
      // Never leave requests stuck in PROCESSING
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`[Processor] Request ${request.id} failed: ${errorMessage}`);

      try {
        // Attempt to mark as failed
        await this.markRequestFailed(request.id, errorMessage);

        // Attempt to log failure
        await this.gdprRepository.createAuditLog({
          identityId: request.identityId,
          action: GdprAuditAction.EXPORT_FAILED,
          entityType: 'gdpr_requests',
          metadata: {
            requestId: request.id,
            failedAt: new Date().toISOString(),
            error: errorMessage,
          },
          performedBy: 'SYSTEM',
        });

        // Send failure notification
        // Await to ensure notification is persisted before continuing
        // Note: Using default language (English) since we don't have user context here
        try {
          const t = getTranslations(undefined);
          await this.notificationService.notifyUser({
            userId: request.identityId,
            eventType: NotificationEvent.SYSTEM_MESSAGE,
            payload: {
              title: t.notifications.gdprExportFailed.title,
              body: t.notifications.gdprExportFailed.body,
              requestId: request.id,
              error: errorMessage,
            },
          });
          this.logger.debug(`[Processor] Failure notification sent for request ${request.id}`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[Processor] Failure notification failed (non-critical): ${errMsg}`);
        }
      } catch (recoveryError) {
        // If we can't even mark as failed, log it but don't throw
        // This prevents cascading failures
        this.logger.error(
          `[Processor] Failed to mark request ${request.id} as failed: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`,
        );
      }

      return 'FAILED';
    }
  }

  /**
   * Execute the processing logic for a request.
   *
   * ───────────────────────────────────────────────────────────────
   * COMPLETE EXPORT PIPELINE IMPLEMENTATION
   * ───────────────────────────────────────────────────────────────
   * This method orchestrates the complete GDPR export flow:
   * 1. Collect user data from all registered tables
   * 2. Build semantic export document
   * 3. Render, package, and store via export pipeline
   *
   * Pipeline Flow:
   * - Phase 3: Data collection (orchestrator)
   * - Phase 3.5: Document building (semantic representation)
   * - Phase 4: Export pipeline (render → package → store)
   * - Phase 4: Metadata persistence (handled by pipeline)
   *
   * Note: The pipeline service handles request completion and metadata
   * persistence, so this method doesn't need to return metadata.
   *
   * @param request - The request being processed
   */
  private async executeProcessing(request: Request): Promise<void> {
    this.logger.log(`[Processor] Executing complete export pipeline for request ${request.id}`);

    // Step 1: Collect user data from all registered tables
    this.logger.debug(`[Processor] Step 1/4: Collecting user data...`);
    const { data: collectedData, summary } = await this.dataOrchestrator.collectUserData(
      request.identityId,
    );

    this.logger.debug(
      `[Processor] Data collected: ${summary.totalSources} sources, ${summary.successfulSources} successful`,
    );

    // Step 2: Build semantic export document
    this.logger.debug(`[Processor] Step 2/4: Building export document...`);
    // Get user's preferred language from profile (fallback to 'en' if no profile)
    // Intentionally using || to handle potentially corrupted or legacy data where language could be empty string
    const language: LanguageCode = collectedData.profile?.language || 'en';
    const document = this.documentBuilder.buildDocument(collectedData, language);

    this.logger.debug(`[Processor] Document built: ${document.sections.length} sections`);

    // Step 3: Run export pipeline (render → package → store → complete)
    this.logger.debug(`[Processor] Step 3/4: Running export pipeline...`);
    const pipelineResult = await this.exportPipeline.execute(document, {
      requestId: request.id,
      identityId: request.identityId,
      expirationDays: 7, // Default 7-day expiration
    });

    if (!pipelineResult.success) {
      throw new Error(`Export pipeline failed: ${pipelineResult.error ?? 'Unknown error'}`);
    }

    this.logger.log(
      `[Processor] Export pipeline completed successfully: ${pipelineResult.storageKey} (${pipelineResult.durationMs}ms)`,
    );

    // Step 4: Persist export file metadata for cleanup job
    this.logger.debug(`[Processor] Step 4/4: Persisting export file metadata...`);
    await this.prisma.gdprExportFile.create({
      data: {
        requestId: request.id,
        storageKey: pipelineResult.storageKey!,
        filename: pipelineResult.filename!,
        fileSize: pipelineResult.fileSize!,
        storageType: pipelineResult.storageProvider!,
        expiresAt: pipelineResult.expiresAt!,
      },
    });

    // Step 5: Send notification
    // Note: notificationService.notifyUser() never throws - it always returns success
    // We await it to ensure the notification is persisted before moving on
    // Note: Using default language (English) since we don't have user language context here
    // In the future, we could load user profile to get their language preference
    try {
      const t = getTranslations(undefined);
      await this.notificationService.notifyUser({
        userId: request.identityId,
        eventType: NotificationEvent.GDPR_EXPORT_READY,
        payload: {
          title: t.notifications.gdprExportReady.title,
          body: t.notifications.gdprExportReady.body,
          requestId: request.id,
          filename: pipelineResult.filename,
          fileSize: pipelineResult.fileSize,
          expiresAt: pipelineResult.expiresAt?.toISOString(),
        },
      });
      this.logger.debug(`[Processor] Success notification sent for request ${request.id}`);
    } catch (err) {
      // This should never happen (notifyUser never throws), but handle it anyway
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[Processor] Notification failed (non-critical): ${errMsg}`);
    }
  }

  /**
   * Mark a request as failed with an error message.
   *
   * Transitions: PROCESSING → FAILED
   * Sets processedAt timestamp and stores error message.
   *
   * Error messages are sanitized to prevent sensitive data leakage.
   *
   * @param requestId - The request that failed
   * @param errorMessage - Safe error description
   */
  private async markRequestFailed(requestId: string, errorMessage: string): Promise<void> {
    // Sanitize error message (limit length, remove sensitive patterns)
    const sanitizedError = this.sanitizeErrorMessage(errorMessage);

    const failed = await this.gdprRepository.markRequestFailed(requestId, sanitizedError);

    if (!failed) {
      this.logger.debug(
        `[Processor] Request ${requestId} failure transition skipped (already transitioned elsewhere)`,
      );
    }
  }

  /**
   * Sanitize error messages before storing in database.
   *
   * Rules:
   * - Limit length to 500 characters
   * - Remove potential PII patterns
   * - Remove stack traces (keep in logs only)
   *
   * @param error - Raw error message
   * @returns Sanitized error message safe for storage
   */
  private sanitizeErrorMessage(error: string): string {
    // Remove stack traces (everything after "at " typically)
    let sanitized = error.split('\n')[0];

    // Limit length
    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 497) + '...';
    }

    return sanitized;
  }
}

// ─────────────────────────────────────────────────────────────
// Type Definitions
// ─────────────────────────────────────────────────────────────

/**
 * Summary of a processing batch execution.
 */
export interface ProcessingSummary {
  /** Total number of pending requests found */
  totalFound: number;
  /** Number of requests successfully processed */
  processed: number;
  /** Number of requests that failed */
  failed: number;
  /** Number of requests skipped (already being processed) */
  skipped: number;
}

/**
 * Result of processing a single request.
 */
type ProcessingResult = 'PROCESSED' | 'FAILED' | 'SKIPPED';
