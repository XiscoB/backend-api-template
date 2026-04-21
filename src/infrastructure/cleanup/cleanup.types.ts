/**
 * Infrastructure Cleanup Types
 *
 * Defines the contract for cleanup jobs that remove old infrastructure data.
 * These cleanups are hygiene-only and must never affect domain logic.
 */

/**
 * Result of a cleanup operation.
 * Returned by all cleanup jobs to provide visibility into what was cleaned.
 */
export interface CleanupResult {
  /**
   * Number of records deleted
   */
  recordsDeleted: number;

  /**
   * Time taken to execute cleanup (milliseconds)
   */
  durationMs: number;

  /**
   * Optional error message if cleanup partially failed
   */
  error?: string;

  /**
   * Additional metadata (e.g., table name, retention period used)
   */
  metadata?: Record<string, unknown>;
}

/**
 * Cleanup job configuration.
 * Each cleanup reads its own environment variables for configuration.
 */
export interface CleanupJobConfig {
  /**
   * Whether this cleanup job is enabled
   */
  enabled: boolean;

  /**
   * Retention period in days
   */
  retentionDays: number;

  /**
   * Optional batch size for deletion
   */
  batchSize?: number;
}

/**
 * Base interface for all cleanup jobs.
 * Each cleanup must implement this interface.
 */
export interface CleanupJob {
  /**
   * Unique identifier for this cleanup job
   */
  readonly name: string;

  /**
   * Run the cleanup operation.
   *
   * Requirements:
   * - Must be idempotent (safe to run multiple times)
   * - Must read its own configuration from environment
   * - Must not affect domain or business logic
   * - Must not throw exceptions (return error in result instead)
   * - Must log its own execution details
   *
   * @returns CleanupResult with deletion details
   */
  run(): Promise<CleanupResult>;
}
