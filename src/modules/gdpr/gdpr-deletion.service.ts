import { Injectable, Logger, ConflictException, ForbiddenException } from '@nestjs/common';
import { Request, GdprAuditAction, RequestType } from '@prisma/client';
import { GdprRepository } from './gdpr.repository';
import { IdentityService } from '../identity/identity.service';
import { GdprAnonymizationService } from './gdpr-anonymization.service';
import { GdprDeletionEmailService } from './gdpr-deletion-email.service';

/**
 * Summary of deletion operation on a single table.
 */
interface TableDeletionSummary {
  table: string;
  strategy: 'DELETE' | 'ANONYMIZE';
  rows: number;
}

/**
 * Result of a GDPR deletion operation.
 */
export interface GdprDeletionResult {
  identityId: string;
  anonymizedUid: string;
  deletedAt: Date;
  summary: TableDeletionSummary[];
  totalRowsAffected: number;
}

/**
 * GDPR Permanent Deletion Service
 *
 * Handles GDPR permanent deletion operations (Right to Erasure).
 * This service reuses the shared suspension/anonymization pipeline.
 *
 * Mental Model:
 * - Permanent deletion = suspension pipeline WITHOUT recovery
 * - Uses same table iteration, ownership resolution, and CASCADE-safe ordering
 * - Mode 'DELETE' = no backup created, no recovery possible
 *
 * Design Principles:
 * - REUSES the GdprAnonymizationService (no duplicate logic)
 * - Registry-driven: Deletion rules come from GDPR registry
 * - Auditable: Single audit log entry per deletion with full summary
 * - No restoration: Deletion is permanent, no undo logic
 * - Identity marked as anonymized (recovery blocked at API boundary)
 *
 * Deletion Strategies (same as suspension):
 * - DELETE: Hard delete all rows matching userField
 * - ANONYMIZE: Replace declared piiFields with placeholder values
 *
 * Post-Deletion State:
 * - All user data deleted or anonymized (per registry strategy)
 * - Identity.anonymized = true (recovery blocked)
 * - No backups exist
 * - Recovery is impossible
 */
@Injectable()
export class GdprDeletionService {
  private readonly logger = new Logger(GdprDeletionService.name);

  constructor(
    private readonly gdprRepository: GdprRepository,
    private readonly identityService: IdentityService,
    private readonly anonymizationService: GdprAnonymizationService,
    private readonly deletionEmailService: GdprDeletionEmailService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Public API - Used by Controllers
  // ─────────────────────────────────────────────────────────────

  /**
   * Request a GDPR permanent deletion.
   *
   * Creates a PENDING request that will be processed by a background worker.
   * Only one pending/processing deletion request per user is allowed.
   *
   * Preconditions:
   * - User must not already be anonymized (deleted)
   * - No pending/processing deletion request exists
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @returns The created request
   * @throws ConflictException if user already has a pending deletion request
   * @throws ForbiddenException if user is already anonymized
   */
  async requestDeletion(externalUserId: string): Promise<Request> {
    this.logger.log(`Permanent deletion requested for user: ${externalUserId}`);

    // Resolve Identity at the boundary
    const identity = await this.identityService.resolveIdentity(externalUserId);

    // Block if already anonymized (already permanently deleted)
    if (identity.anonymized) {
      throw new ForbiddenException(
        'Account has already been permanently deleted. No further action possible.',
      );
    }

    // Check for existing pending request
    const hasPending = await this.gdprRepository.hasPendingRequest(
      identity.id,
      RequestType.GDPR_DELETE,
    );
    if (hasPending) {
      throw new ConflictException(
        'A deletion request is already pending or processing. Please wait for it to complete.',
      );
    }

    // Create the request
    const request = await this.gdprRepository.createRequest({
      identityId: identity.id,
      requestType: RequestType.GDPR_DELETE,
    });

    // Note: We write ONE audit log entry per deletion at completion/failure,
    // not on request creation. This keeps the audit log minimal.

    this.logger.log(`Deletion request created: ${request.id}`);
    return request;
  }

  // ─────────────────────────────────────────────────────────────
  // Cron-Compatible Methods - Used by Background Workers
  // ─────────────────────────────────────────────────────────────

  /**
   * Process pending deletion requests.
   *
   * This method is designed to be called by a cron job or background worker.
   * It processes one request at a time to avoid overwhelming the database.
   *
   * @param limit - Maximum number of requests to process in this batch
   * @returns Number of requests processed
   */
  async processPendingDeletions(limit: number = 10): Promise<number> {
    const claimedRequests = await this.gdprRepository.claimPendingRequestsForProcessing(
      RequestType.GDPR_DELETE,
      limit,
    );
    let processed = 0;

    for (const request of claimedRequests) {
      try {
        await this.processClaimedDeletionRequest(request);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to process deletion request ${request.id}: ${errorMessage}`);
        // Error is already logged in processDeletionRequest, continue to next
      }
    }

    if (processed > 0) {
      this.logger.log(`Processed ${processed} deletion requests`);
    }

    return processed;
  }

  // ─────────────────────────────────────────────────────────────
  // Internal Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Process a single deletion request.
   *
   * REUSES the shared GdprAnonymizationService with mode='DELETE'.
   * This ensures the same table iteration, ownership resolution, and
   * CASCADE-safe ordering as suspension - but WITHOUT backup creation.
   *
   * Post-processing:
   * - Identity.anonymized = true (blocks future API access)
   * - No backups exist (recovery is impossible)
   */
  async processClaimedDeletionRequest(request: Request): Promise<void> {
    const { id, identityId } = request;

    this.logger.log(`Processing permanent deletion request: ${id}`);

    try {
      // Generate ONE random anonymized UID for this entire deletion
      const anonymizedUid = this.anonymizationService.generateAnonymizedUid();

      // Execute deletion using shared anonymization service with mode='DELETE'
      // This reuses the same pipeline as suspension but WITHOUT backup creation
      const result = await this.anonymizationService.anonymize({
        identityId,
        anonymizedUid,
        mode: 'DELETE', // No backup created, permanent operation
      });

      // Convert to deletion summary format
      const summary: TableDeletionSummary[] = result.summary.map((s) => ({
        table: s.table,
        strategy: s.action === 'DELETED' ? 'DELETE' : 'ANONYMIZE',
        rows: s.rows,
      }));

      // CRITICAL: Mark Identity as permanently deleted (blocks future API access)
      await this.identityService.anonymizeIdentity(identityId);

      // Mark request as completed (guarded: PROCESSING -> COMPLETED)
      const completed = await this.gdprRepository.markRequestCompleted(id);
      if (!completed) {
        this.logger.debug(
          `Completion transition skipped for deletion request ${id} (already transitioned elsewhere)`,
        );
        return;
      }

      // Write exactly ONE audit log entry per deletion with status: SUCCESS
      await this.gdprRepository.createAuditLog({
        identityId,
        action: GdprAuditAction.DELETE,
        metadata: {
          status: 'PERMANENT_DELETE_SUCCESS',
          requestId: id,
          anonymizedUid,
          identityAnonymized: true,
          backupsCreated: false,
          recoveryPossible: false,
          details: summary,
          totalRowsAffected: result.totalRowsAffected,
          note: 'Permanent deletion completed. No backup created. Recovery is impossible.',
        },
        performedBy: 'SYSTEM',
      });

      this.logger.log(
        `Permanent deletion completed: ${id} (${result.totalRowsAffected} rows across ${summary.length} tables)`,
      );

      // ─────────────────────────────────────────────────────────────────────
      // Send deletion confirmation email from captured record (fire-and-forget)
      // Email was captured at T+0 by GdprDeletionEmailService
      // Record is deleted immediately after send attempt (success or failure)
      // ─────────────────────────────────────────────────────────────────────
      await this.deletionEmailService.sendAndDeleteConfirmation(id, {
        identityId,
        requestId: id,
        anonymizedAt: new Date(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Mark as failed (guarded: PROCESSING -> FAILED)
      const failed = await this.gdprRepository.markRequestFailed(id, errorMessage);
      if (!failed) {
        this.logger.debug(
          `Failure transition skipped for deletion request ${id} (already transitioned elsewhere)`,
        );
        return;
      }

      // Write exactly ONE audit log entry per deletion with status: FAILED
      await this.gdprRepository.createAuditLog({
        identityId,
        action: GdprAuditAction.DELETE,
        metadata: {
          status: 'PERMANENT_DELETE_FAILED',
          requestId: id,
          error: errorMessage,
          note: 'Permanent deletion failed. Partial deletion may have occurred.',
        },
        performedBy: 'SYSTEM',
      });

      this.logger.error(`Permanent deletion failed: ${id} - ${errorMessage}`);
      throw error;
    }
  }
}
