import { Injectable, Logger } from '@nestjs/common';
import { GdprRequestProcessorService } from './gdpr-request-processor.service';
import { GdprDeletionService } from './gdpr-deletion.service';
import { GdprDeletionLifecycleService } from './gdpr-deletion-lifecycle.service';
import { GdprSuspensionService } from './gdpr-suspension.service';
import { GdprSuspensionEscalationService } from './gdpr-suspension-escalation.service';
import { GdprExportCleanupService, CleanupResult } from './gdpr-export-cleanup.service';
import { DeletionLegalHoldService } from './deletion-legal-hold.service';
import { InternalLogService } from './internal-log.service';

/**
 * GDPR Cron Service
 *
 * Provides methods designed to be called by external cron jobs or schedulers.
 *
 * This service does NOT include @nestjs/schedule decorators intentionally.
 * The actual scheduling should be done by:
 * - External cron jobs (Kubernetes CronJob, AWS EventBridge, etc.)
 * - A separate scheduler module if internal scheduling is needed
 *
 * Why external scheduling?
 * - Template neutrality: Different projects have different infra
 * - Flexibility: Can use any scheduler (K8s, Lambda, node-cron, etc.)
 * - Testability: Methods can be called directly in tests
 *
 * Usage examples:
 *
 * 1. Call from HTTP endpoint (for testing or manual triggers):
 *    POST /api/v1/admin/gdpr/process-exports
 *    POST /api/v1/admin/gdpr/process-deletions
 *    POST /api/v1/admin/gdpr/process-suspensions
 *    POST /api/v1/admin/gdpr/process-escalations
 *
 * 2. Call from external cron (Kubernetes CronJob):
 *    curl -X POST http://localhost:3000/api/internal/gdpr/process
 *
 * 3. Call from @nestjs/schedule (if added separately):
 *    @Cron('* * * * *')
 *    async handleCron() {
 *      await this.gdprCronService.processPendingExports();
 *      await this.gdprCronService.processPendingDeletions();
 *      await this.gdprCronService.processPendingSuspensions();
 *      await this.gdprCronService.processExpiredSuspensions();
 *    }
 *
 * NOTE: This service hosts GDPR-adjacent and general hygiene cleanup tasks.
 * Future refactors may rename to MaintenanceCronService if scope expands.
 */
@Injectable()
export class GdprCronService {
  private readonly logger = new Logger(GdprCronService.name);

  constructor(
    private readonly gdprRequestProcessor: GdprRequestProcessorService,
    private readonly gdprDeletionService: GdprDeletionService,
    private readonly gdprDeletionLifecycleService: GdprDeletionLifecycleService,
    private readonly gdprSuspensionService: GdprSuspensionService,
    private readonly gdprSuspensionEscalationService: GdprSuspensionEscalationService,
    private readonly gdprExportCleanupService: GdprExportCleanupService,
    private readonly deletionLegalHoldService: DeletionLegalHoldService,
    private readonly internalLogService: InternalLogService,
  ) {}

  /**
   * Process all pending GDPR export requests.
   *
   * Should be called periodically (e.g., every minute or every 5 minutes).
   * Processes requests in batches to avoid overwhelming the database.
   *
   * @param batchSize - Number of requests to process per batch (default: 10)
   * @returns Summary of the processing run
   */
  async processPendingExports(batchSize: number = 10): Promise<{
    processed: number;
    durationMs: number;
  }> {
    // ARCHITECTURE NOTE (Concurrency Safety):
    // GDPR request workers can run in parallel across instances (internal scheduler + external ops jobs).
    // To prevent duplicate processing, request claiming uses a single atomic DB transition
    // (UPDATE ... RETURNING with FOR UPDATE SKIP LOCKED in the repository layer), not in-memory ownership.
    // Stale PROCESSING rows are reclaimable after a bounded timeout for crash recovery.
    // If lock/claim operations fail, processing fails closed by throwing (no unlocked fallback path).
    const startTime = Date.now();

    this.logger.log('Starting GDPR export processing run...');

    const summary = await this.gdprRequestProcessor.processPendingExports(batchSize);

    const durationMs = Date.now() - startTime;

    if (summary.processed > 0) {
      this.logger.log(`Processed ${summary.processed} export requests in ${durationMs}ms`);
    } else {
      this.logger.debug(`No pending exports to process (${durationMs}ms)`);
    }

    return { processed: summary.processed, durationMs };
  }

  /**
   * Process all pending GDPR deletion requests.
   *
   * Should be called periodically (e.g., every minute or every 5 minutes).
   * Processes requests in batches to avoid overwhelming the database.
   *
   * Deletion behavior is registry-driven:
   * - DELETE strategy: Hard delete rows
   * - ANONYMIZE strategy: Replace fields with anonymized values
   *
   * @param batchSize - Number of requests to process per batch (default: 10)
   * @returns Summary of the processing run
   */
  async processPendingDeletions(batchSize: number = 10): Promise<{
    processed: number;
    durationMs: number;
  }> {
    const startTime = Date.now();

    this.logger.log('Starting GDPR deletion processing run...');

    const processed = await this.gdprDeletionService.processPendingDeletions(batchSize);

    const durationMs = Date.now() - startTime;

    if (processed > 0) {
      this.logger.log(`Processed ${processed} deletion requests in ${durationMs}ms`);
    } else {
      this.logger.debug(`No pending deletions to process (${durationMs}ms)`);
    }

    return { processed, durationMs };
  }

  /**
   * Process all pending GDPR suspension requests.
   *
   * Should be called periodically (e.g., every minute or every 5 minutes).
   * Processes requests in batches to avoid overwhelming the database.
   *
   * Suspension behavior:
   * - Backs up user data before anonymization
   * - Anonymizes data (preserves structure, replaces PII)
   * - Sets auto-escalation deadline
   *
   * @param batchSize - Number of requests to process per batch (default: 10)
   * @returns Summary of the processing run
   */
  async processPendingSuspensions(batchSize: number = 10): Promise<{
    processed: number;
    durationMs: number;
  }> {
    const startTime = Date.now();

    this.logger.log('Starting GDPR suspension processing run...');

    const processed = await this.gdprSuspensionService.processPendingSuspensions(batchSize);

    const durationMs = Date.now() - startTime;

    if (processed > 0) {
      this.logger.log(`Processed ${processed} suspension requests in ${durationMs}ms`);
    } else {
      this.logger.debug(`No pending suspensions to process (${durationMs}ms)`);
    }

    return { processed, durationMs };
  }

  /**
   * Process expired suspensions and escalate to deletion.
   *
   * Should be called periodically (e.g., once per hour or once per day).
   * Finds suspensions past their grace period and triggers deletion.
   *
   * Escalation behavior:
   * - Triggers GDPR_DELETE pipeline for each expired suspension
   * - Marks suspension as expired
   * - Deletes backup data (no longer recoverable)
   * - Notifies user
   *
   * @param limit - Maximum number of escalations to process (default: 10)
   * @returns Summary of the escalation run
   */
  async processExpiredSuspensions(limit: number = 10): Promise<{
    escalated: number;
    durationMs: number;
  }> {
    const startTime = Date.now();

    this.logger.log('Starting GDPR suspension escalation run...');

    const escalated = await this.gdprSuspensionEscalationService.processExpiredSuspensions(limit);

    const durationMs = Date.now() - startTime;

    if (escalated > 0) {
      this.logger.log(`Escalated ${escalated} expired suspensions in ${durationMs}ms`);
    } else {
      this.logger.debug(`No expired suspensions to escalate (${durationMs}ms)`);
    }

    return { escalated, durationMs };
  }

  /**
   * Send expiration warnings for suspensions approaching their deadline.
   *
   * Should be called periodically (e.g., once per day).
   * Notifies users whose suspensions are about to expire.
   *
   * @param daysBeforeExpiration - How many days before expiration to warn (default: 7)
   * @param limit - Maximum number of warnings to send (default: 100)
   * @returns Summary of the warning run
   */
  async sendExpirationWarnings(
    daysBeforeExpiration: number = 7,
    limit: number = 100,
  ): Promise<{
    warned: number;
    durationMs: number;
  }> {
    const startTime = Date.now();

    this.logger.log('Starting GDPR suspension expiration warning run...');

    const warned = await this.gdprSuspensionEscalationService.sendExpirationWarnings(
      daysBeforeExpiration,
      limit,
    );

    const durationMs = Date.now() - startTime;

    if (warned > 0) {
      this.logger.log(`Sent ${warned} expiration warnings in ${durationMs}ms`);
    } else {
      this.logger.debug(`No expiration warnings to send (${durationMs}ms)`);
    }

    return { warned, durationMs };
  }

  /**
   * Clean up expired GDPR exports.
   *
   * Should be called periodically (e.g., once per day, recommended at 02:00 UTC).
   * Finds COMPLETED exports past their expiration date and:
   * - Deletes the export file from storage
   * - Updates the request status to EXPIRED
   * - Creates an audit log entry
   *
   * This ensures that:
   * - User data is not retained longer than necessary (GDPR compliance)
   * - Storage costs are minimized
   * - Expired download links return appropriate errors
   *
   * @param batchSize - Number of exports to process per run (default: 100)
   * @returns Summary of the cleanup run
   */
  async cleanupExpiredExports(batchSize: number = 100): Promise<CleanupResult> {
    this.logger.log('Starting GDPR export cleanup run...');

    const result = await this.gdprExportCleanupService.cleanupExpiredExports(batchSize);

    if (result.deleted > 0) {
      this.logger.log(
        `Cleanup completed: ${result.deleted} exports deleted, ${result.failed} failed (${result.durationMs}ms)`,
      );
    } else {
      this.logger.debug(`No expired exports to clean up (${result.durationMs}ms)`);
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // Deletion Lifecycle Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Process deletions where grace period has expired.
   *
   * Should be called periodically (e.g., every hour or once per day).
   * Finds identities in PENDING_DELETION state whose grace period has expired
   * and triggers final deletion (anonymization).
   *
   * This is separate from processPendingDeletions which handles
   * the actual data anonymization for already-approved deletions.
   *
   * @param batchSize - Number of deletions to finalize per run (default: 10)
   * @returns Summary of the finalization run
   */
  async processExpiredDeletionGracePeriods(batchSize: number = 10): Promise<{
    finalized: number;
    durationMs: number;
  }> {
    const startTime = Date.now();

    this.logger.log('Starting GDPR deletion grace period expiration run...');

    const finalized = await this.gdprDeletionLifecycleService.processExpiredGracePeriods(batchSize);

    const durationMs = Date.now() - startTime;

    if (finalized > 0) {
      this.logger.log(`Finalized ${finalized} deletions (grace period expired) in ${durationMs}ms`);
    } else {
      this.logger.debug(`No expired deletion grace periods to process (${durationMs}ms)`);
    }

    return { finalized, durationMs };
  }

  /**
   * Send warning emails for deletions approaching finalization.
   *
   * Should be called periodically (e.g., once per day).
   * Notifies users whose deletion grace period is about to expire.
   *
   * @param limit - Maximum number of warnings to send (default: 100)
   * @returns Summary of the warning run
   */
  async sendDeletionWarnings(limit: number = 100): Promise<{
    warned: number;
    durationMs: number;
  }> {
    const startTime = Date.now();

    this.logger.log('Starting GDPR deletion warning run...');

    const warned = await this.gdprDeletionLifecycleService.sendDeletionWarnings(limit);

    const durationMs = Date.now() - startTime;

    if (warned > 0) {
      this.logger.log(`Sent ${warned} deletion warnings in ${durationMs}ms`);
    } else {
      this.logger.debug(`No deletion warnings to send (${durationMs}ms)`);
    }

    return { warned, durationMs };
  }

  // ─────────────────────────────────────────────────────────────
  // Deletion Legal Hold Cleanup
  // ─────────────────────────────────────────────────────────────

  /**
   * Clean up expired deletion legal holds.
   *
   * Should be called periodically (e.g., once per day).
   * Removes deletion legal holds past their expiration date.
   *
   * IMPORTANT: Deletion legal holds block account deletion temporarily.
   * Expired holds are automatically removed to ensure:
   * - No indefinite deletion blocks
   * - GDPR time-bounded compliance
   *
   * ⚠️ THIS IS NOT: data retention, statutory retention, or fraud prevention.
   *
   * This cleanup is idempotent and safe to run multiple times.
   *
   * @param limit - Maximum number of holds to process per run (default: 100)
   * @returns Summary of the cleanup run
   */
  async cleanupExpiredDeletionLegalHolds(limit: number = 100): Promise<{
    cleaned: number;
    durationMs: number;
  }> {
    const startTime = Date.now();

    this.logger.log('Starting deletion legal hold cleanup run...');

    const cleaned = await this.deletionLegalHoldService.cleanupExpiredHolds(limit);

    const durationMs = Date.now() - startTime;

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired deletion legal hold(s) in ${durationMs}ms`);
    } else {
      this.logger.debug(`No expired deletion legal holds to clean up (${durationMs}ms)`);
    }

    return { cleaned, durationMs };
  }

  // ─────────────────────────────────────────────────────────────
  // Internal Operational Log Cleanup
  // ─────────────────────────────────────────────────────────────

  /**
   * Clean up expired internal operational logs.
   *
   * Should be called periodically (e.g., once per day).
   * Removes internal logs older than the configured retention period.
   *
   * IMPORTANT: Internal logs are platform diagnostics ONLY.
   * They are NOT:
   * - Analytics or metrics
   * - User activity tracking
   * - Audit logs (use GdprAuditLog)
   * - Business event logs
   *
   * Legal basis: Legitimate interest (platform stability)
   * GDPR: NOT personal data, NOT included in exports
   *
   * This cleanup is idempotent and safe to run multiple times.
   *
   * @param retentionDays - Days to retain logs (default: from config)
   * @param limit - Maximum logs to delete per run (default: 1000)
   * @returns Summary of the cleanup run
   *
   * @see docs/INTERNAL_OPERATIONAL_LOGS.md
   */
  async cleanupExpiredInternalLogs(
    retentionDays?: number,
    limit?: number,
  ): Promise<{
    cleaned: number;
    durationMs: number;
  }> {
    const startTime = Date.now();

    this.logger.log('Starting internal log cleanup run...');

    const cleaned = await this.internalLogService.cleanupExpiredLogs(retentionDays, limit);

    const durationMs = Date.now() - startTime;

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired internal log(s) in ${durationMs}ms`);
    } else {
      this.logger.debug(`No expired internal logs to clean up (${durationMs}ms)`);
    }

    return { cleaned, durationMs };
  }
}
