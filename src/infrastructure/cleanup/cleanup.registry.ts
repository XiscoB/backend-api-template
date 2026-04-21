import { Injectable, Logger } from '@nestjs/common';
import { CleanupJob, CleanupResult } from './cleanup.types';

/**
 * Cleanup Registry
 *
 * Centralized registry of all cleanup jobs.
 * Provides a single entry point for executing all registered cleanups.
 *
 * Design:
 * - Each cleanup is independent (no ordering, no dependencies)
 * - Failures in one cleanup do NOT stop others
 * - All cleanups run sequentially to avoid database contention
 * - Registry itself has no configuration (cleanups read their own env vars)
 */
@Injectable()
export class CleanupRegistry {
  private readonly logger = new Logger(CleanupRegistry.name);
  private readonly jobs: Map<string, CleanupJob> = new Map();

  /**
   * Register a cleanup job.
   * Called during module initialization.
   *
   * @param job - The cleanup job to register
   */
  register(job: CleanupJob): void {
    if (this.jobs.has(job.name)) {
      this.logger.warn(`Cleanup job "${job.name}" is already registered, skipping`);
      return;
    }

    this.jobs.set(job.name, job);
    this.logger.log(`Registered cleanup job: ${job.name}`);
  }

  /**
   * Run all registered cleanup jobs.
   *
   * Jobs are executed sequentially to avoid database contention.
   * Failures in one job do NOT stop execution of other jobs.
   *
   * @returns Array of results from all cleanup jobs
   */
  async runAll(): Promise<Map<string, CleanupResult>> {
    const startTime = Date.now();
    const results = new Map<string, CleanupResult>();

    this.logger.log(`Running ${this.jobs.size} cleanup job(s)...`);

    for (const [name, job] of this.jobs) {
      try {
        this.logger.log(`Starting cleanup: ${name}`);
        const result = await job.run();
        results.set(name, result);

        if (result.error) {
          this.logger.warn(`Cleanup "${name}" completed with errors: ${result.error}`);
        } else {
          this.logger.log(
            `Cleanup "${name}" completed: ${result.recordsDeleted} record(s) deleted in ${result.durationMs}ms`,
          );
        }
      } catch (error) {
        this.logger.error(`Cleanup "${name}" threw exception:`, error);
        results.set(name, {
          recordsDeleted: 0,
          durationMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const totalDeleted = Array.from(results.values()).reduce(
      (sum, result) => sum + result.recordsDeleted,
      0,
    );

    this.logger.log(
      `All cleanup jobs completed: ${totalDeleted} total record(s) deleted in ${totalDuration}ms`,
    );

    return results;
  }

  /**
   * Run a specific cleanup job by name.
   *
   * @param name - Name of the cleanup job to run
   * @returns Result of the cleanup job, or null if not found
   */
  async runOne(name: string): Promise<CleanupResult | null> {
    const job = this.jobs.get(name);
    if (!job) {
      this.logger.warn(`Cleanup job "${name}" not found`);
      return null;
    }

    try {
      this.logger.log(`Starting cleanup: ${name}`);
      const result = await job.run();

      if (result.error) {
        this.logger.warn(`Cleanup "${name}" completed with errors: ${result.error}`);
      } else {
        this.logger.log(
          `Cleanup "${name}" completed: ${result.recordsDeleted} record(s) deleted in ${result.durationMs}ms`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`Cleanup "${name}" threw exception:`, error);
      return {
        recordsDeleted: 0,
        durationMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get list of all registered cleanup job names.
   *
   * @returns Array of cleanup job names
   */
  getRegisteredJobs(): string[] {
    return Array.from(this.jobs.keys());
  }
}
