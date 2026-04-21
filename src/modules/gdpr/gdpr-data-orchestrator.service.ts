import { Injectable, Logger } from '@nestjs/common';
import { GdprDataCollectorService } from './gdpr-data-collector.service';
import {
  GdprCollectedData,
  GdprCollectionMetadata,
  GdprCollectionSummary,
  GdprCollectionSourceResult,
} from './gdpr-collection.types';

/**
 * GDPR Data Collection Orchestrator Service
 *
 * Implements Phase 3 of the GDPR system: data collection orchestration.
 * This service coordinates all data collectors to gather complete user data.
 *
 * ───────────────────────────────────────────────────────────────
 * Purpose:
 * ───────────────────────────────────────────────────────────────
 * - Orchestrate data collection from all GDPR sources
 * - Aggregate results into a unified structure
 * - Handle partial failures gracefully
 * - Provide collection summary for audit trail
 * - NO export formatting (that's Phase 4)
 * - NO file generation (that's Phase 4)
 * - NO storage logic (that's Phase 4)
 *
 * ───────────────────────────────────────────────────────────────
 * Design Principles:
 * ───────────────────────────────────────────────────────────────
 * - Sequential collection (predictable, debuggable)
 * - Fail-safe per source (one failure doesn't stop collection)
 * - Detailed logging for audit trail
 * - No cross-source dependencies
 * - Returns complete data structure even on partial failures
 *
 * ───────────────────────────────────────────────────────────────
 * Integration Point for Phase 2:
 * ───────────────────────────────────────────────────────────────
 * Phase 2 (request processor) will eventually call:
 *   const data = await orchestrator.collectUserData(identityId);
 *
 * But Phase 2 code remains unchanged for now.
 * This service is ready when Phase 4 needs it.
 *
 * ───────────────────────────────────────────────────────────────
 * Error Handling Strategy:
 * ───────────────────────────────────────────────────────────────
 * - Identity collection failure: FATAL (cannot proceed without identity)
 * - Other source failures: NON-FATAL (collect what we can)
 * - All failures logged with details
 * - Summary reports success/failure per source
 *
 * @see GdprDataCollectorService for individual collectors
 * @see gdpr-collection.types.ts for data structure definitions
 */
@Injectable()
export class GdprDataOrchestratorService {
  private readonly logger = new Logger(GdprDataOrchestratorService.name);

  // Schema version for future compatibility
  private readonly COLLECTION_SCHEMA_VERSION = '1.0.0';

  constructor(private readonly collector: GdprDataCollectorService) {}

  /**
   * Collect all GDPR data for a user.
   *
   * This is the main entry point for data collection.
   * It orchestrates all collectors and aggregates results.
   *
   * Collection Strategy:
   * - Identity is collected first (required, fails if missing)
   * - Other sources collected sequentially
   * - Partial failures are logged but don't stop collection
   * - Returns complete data structure even on partial failures
   *
   * Future Integration:
   * Phase 2 (request processor) will call this method to get user data.
   * Phase 4 (export formatter) will receive this data and generate files.
   *
   * @param identityId - The identity ID to collect data for
   * @returns Complete collected data and collection summary
   * @throws Error only if identity doesn't exist (fatal error)
   */
  async collectUserData(identityId: string): Promise<{
    data: GdprCollectedData;
    summary: GdprCollectionSummary;
  }> {
    this.logger.log(`[Orchestrator] Starting data collection for identity: ${identityId}`);

    const startTime = Date.now();
    const sourceResults: GdprCollectionSourceResult[] = [];

    // Initialize with empty/null values (will be populated)
    // Initialize with empty/null values (will be populated)
    const data: Partial<GdprCollectedData> = {
      // metadata: generated at step 5
      // identity: collected at step 1
      profile: null,
      notifications: { totalCount: 0, notifications: [] },
      notificationPreferences: null,
    };

    // ─────────────────────────────────────────────────────────────
    // Step 1: Collect Identity (REQUIRED)
    // ─────────────────────────────────────────────────────────────
    // Identity is the ownership anchor. If this fails, we cannot proceed.
    // All other data is owned by this identity.

    try {
      const identityStart = Date.now();
      data.identity = await this.collector.collectIdentity(identityId);
      const identityDuration = Date.now() - identityStart;

      sourceResults.push({
        source: 'identity',
        success: true,
        durationMs: identityDuration,
      });

      this.logger.debug(`[Orchestrator] Identity collected successfully (${identityDuration}ms)`);
    } catch (error) {
      // Identity collection failure is FATAL
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[Orchestrator] FATAL: Identity collection failed: ${errorMessage}`);

      sourceResults.push({
        source: 'identity',
        success: false,
        error: errorMessage,
        durationMs: Date.now() - startTime,
      });

      // Cannot proceed without identity
      throw new Error(`Identity collection failed: ${errorMessage}`);
    }

    // ─────────────────────────────────────────────────────────────
    // Step 2: Collect Profile (OPTIONAL)
    // ─────────────────────────────────────────────────────────────

    try {
      const profileStart = Date.now();
      data.profile = await this.collector.collectProfile(identityId);
      const profileDuration = Date.now() - profileStart;

      sourceResults.push({
        source: 'profile',
        success: true,
        durationMs: profileDuration,
      });

      this.logger.debug(
        `[Orchestrator] Profile collected: ${data.profile ? 'found' : 'not found'} (${profileDuration}ms)`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[Orchestrator] Profile collection failed (non-fatal): ${errorMessage}`);

      sourceResults.push({
        source: 'profile',
        success: false,
        error: errorMessage,
        durationMs: 0,
      });

      // Set to null and continue
      data.profile = null;
    }

    // ─────────────────────────────────────────────────────────────
    // Step 3: Collect Notifications (OPTIONAL)
    // ─────────────────────────────────────────────────────────────

    try {
      const notificationsStart = Date.now();
      data.notifications = await this.collector.collectNotifications(identityId);
      const notificationsDuration = Date.now() - notificationsStart;

      sourceResults.push({
        source: 'notifications',
        success: true,
        durationMs: notificationsDuration,
      });

      this.logger.debug(
        `[Orchestrator] Notifications collected: ${data.notifications.totalCount} found (${notificationsDuration}ms)`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Orchestrator] Notifications collection failed (non-fatal): ${errorMessage}`,
      );

      sourceResults.push({
        source: 'notifications',
        success: false,
        error: errorMessage,
        durationMs: 0,
      });

      // Set to empty and continue
      data.notifications = { totalCount: 0, notifications: [] };
    }

    // ─────────────────────────────────────────────────────────────
    // Step 4: Collect Notification Preferences (OPTIONAL)
    // ─────────────────────────────────────────────────────────────

    try {
      const preferencesStart = Date.now();
      data.notificationPreferences =
        await this.collector.collectNotificationPreferences(identityId);
      const preferencesDuration = Date.now() - preferencesStart;

      sourceResults.push({
        source: 'notificationPreferences',
        success: true,
        durationMs: preferencesDuration,
      });

      this.logger.debug(
        `[Orchestrator] Notification preferences collected: ${data.notificationPreferences ? 'found' : 'not found'} (${preferencesDuration}ms)`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Orchestrator] Notification preferences collection failed (non-fatal): ${errorMessage}`,
      );

      sourceResults.push({
        source: 'notificationPreferences',
        success: false,
        error: errorMessage,
        durationMs: 0,
      });

      // Set to null and continue
      data.notificationPreferences = null;
    }

    // ─────────────────────────────────────────────────────────────
    // Step 5: Generate Metadata
    // ─────────────────────────────────────────────────────────────

    const totalDuration = Date.now() - startTime;
    const successfulSources = sourceResults.filter((r) => r.success).length;
    const failedSources = sourceResults.filter((r) => !r.success).length;

    const metadata: GdprCollectionMetadata = {
      identityId,
      collectedAt: new Date(),
      sourcesCollected: successfulSources,
      sources: sourceResults.filter((r) => r.success).map((r) => r.source),
      schemaVersion: this.COLLECTION_SCHEMA_VERSION,
    };

    data.metadata = metadata;

    // ─────────────────────────────────────────────────────────────
    // Step 6: Generate Summary
    // ─────────────────────────────────────────────────────────────

    const summary: GdprCollectionSummary = {
      identityId,
      totalSources: sourceResults.length,
      successfulSources,
      failedSources,
      sourceResults,
      totalDurationMs: totalDuration,
      overallSuccess: successfulSources > 0, // At least identity must succeed
    };

    this.logger.log(
      `[Orchestrator] Collection complete for identity ${identityId}: ` +
        `${successfulSources}/${sourceResults.length} sources succeeded (${totalDuration}ms)`,
    );

    if (failedSources > 0) {
      this.logger.warn(
        `[Orchestrator] ${failedSources} sources failed for identity ${identityId}. ` +
          `Check logs for details.`,
      );
    }

    return {
      data: data as GdprCollectedData,
      summary,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Future Extension Points
  // ─────────────────────────────────────────────────────────────

  /**
   * When adding new data sources:
   *
   * 1. Add collector method to GdprDataCollectorService
   * 2. Add property to GdprCollectedData interface
   * 3. Add collection step in collectUserData() following this pattern:
   *
   * try {
   *   const start = Date.now();
   *   data.newSource = await this.collector.collectNewSource(identityId);
   *   const duration = Date.now() - start;
   *
   *   sourceResults.push({
   *     source: 'newSource',
   *     success: true,
   *     durationMs: duration,
   *   });
   *
   *   this.logger.debug(`[Orchestrator] New source collected (${duration}ms)`);
   * } catch (error) {
   *   const errorMessage = error instanceof Error ? error.message : String(error);
   *   this.logger.warn(`[Orchestrator] New source collection failed: ${errorMessage}`);
   *
   *   sourceResults.push({
   *     source: 'newSource',
   *     success: false,
   *     error: errorMessage,
   *     durationMs: 0,
   *   });
   *
   *   data.newSource = null; // or appropriate default
   * }
   *
   * Guidelines:
   * - Wrap each collection in try-catch
   * - Log success and failure
   * - Add result to sourceResults
   * - Provide sensible default on failure
   * - Continue collection even on failure (unless identity)
   */
}
