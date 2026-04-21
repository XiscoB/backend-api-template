import { Injectable, Logger } from '@nestjs/common';
import { CleanupRegistry } from './cleanup.registry';
import { CleanupResult } from './cleanup.types';

/**
 * Infrastructure Cleanup Cron Service
 *
 * Coordinator for all infrastructure cleanup jobs.
 * Designed to be called by external cron jobs or schedulers.
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
 * Cleanup guarantees:
 * - Pure hygiene (no domain or business logic affected)
 * - Idempotent (safe to run multiple times)
 * - Environment-gated (can be disabled per cleanup)
 * - Failure-isolated (one cleanup failure does not stop others)
 *
 * Usage examples:
 *
 * 1. Call from HTTP endpoint (for testing or manual triggers):
 *    POST /api/internal/cleanup/run
 *
 * 2. Call from external cron (Kubernetes CronJob):
 *    curl -X POST http://localhost:3000/api/internal/cleanup/run
 *
 * 3. Call from @nestjs/schedule (if added separately):
 *    @Cron('0 2 * * *') // Daily at 2 AM
 *    async handleCron() {
 *      await this.cleanupCronService.runAllCleanups();
 *    }
 */
@Injectable()
export class CleanupCronService {
  private readonly logger = new Logger(CleanupCronService.name);

  constructor(private readonly cleanupRegistry: CleanupRegistry) {}

  /**
   * Run all registered cleanup jobs.
   *
   * Jobs are executed sequentially to avoid database contention.
   * Failures in one job do NOT stop execution of other jobs.
   *
   * Recommended schedule: Daily (e.g., 2 AM)
   *
   * @returns Summary of all cleanup operations
   */
  async runAllCleanups(): Promise<{
    totalRecordsDeleted: number;
    durationMs: number;
    results: Map<string, CleanupResult>;
  }> {
    const startTime = Date.now();

    this.logger.log('Starting infrastructure cleanup run...');

    const results = await this.cleanupRegistry.runAll();

    const totalRecordsDeleted = Array.from(results.values()).reduce(
      (sum, result): number => sum + result.recordsDeleted,
      0,
    );

    const durationMs = Date.now() - startTime;

    this.logger.log(
      `Infrastructure cleanup completed: ${totalRecordsDeleted} record(s) deleted in ${durationMs}ms`,
    );

    return {
      totalRecordsDeleted,
      durationMs,
      results,
    };
  }

  /**
   * Run a specific cleanup job by name.
   *
   * Useful for testing or manual cleanup of a specific table.
   *
   * @param name - Name of the cleanup job to run
   * @returns Result of the cleanup job, or null if not found
   */
  async runCleanup(name: string): Promise<CleanupResult | null> {
    this.logger.log(`Running specific cleanup: ${name}`);
    return await this.cleanupRegistry.runOne(name);
  }

  /**
   * Get list of all registered cleanup jobs.
   *
   * Useful for discovering available cleanup jobs.
   *
   * @returns Array of cleanup job names
   */
  getAvailableCleanups(): string[] {
    return this.cleanupRegistry.getRegisteredJobs();
  }
}
