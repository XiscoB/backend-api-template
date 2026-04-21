/**
 * Scheduler Lock Service Abstraction
 *
 * Defines the interface for acquiring and releasing distributed locks for scheduled jobs.
 * This abstraction allows swapping the underlying locking mechanism (e.g., Postgres, Redis)
 * without changing the scheduler logic.
 *
 * @module infrastructure/scheduler
 */

export interface LockAcquisitionResult {
  acquired: boolean;
  lockId: string;
  reason?: string;
}

export abstract class SchedulerLockService {
  /**
   * Attempt to acquire a lock for a job.
   *
   * @param jobName - Unique name of the job to lock
   * @param ttlMs - Lock TTL in milliseconds
   * @returns Lock acquisition result
   */
  abstract acquireLock(jobName: string, ttlMs?: number): Promise<LockAcquisitionResult>;

  /**
   * Release a lock for a job.
   *
   * @param jobName - Unique name of the job to unlock
   * @returns true if released, false if not held by this instance
   */
  abstract releaseLock(jobName: string): Promise<boolean>;

  /**
   * Update the last run time for a job.
   *
   * @param jobName - Unique name of the job
   */
  abstract updateLastRunTime(jobName: string): Promise<void>;

  /**
   * Get the instance ID for this scheduler instance.
   */
  abstract getInstanceId(): string;

  /**
   * Clean up stale locks (for maintenance).
   */
  abstract cleanupStaleLocks(): Promise<number>;
}
