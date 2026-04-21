/**
 * Scheduler Types
 *
 * Type definitions for the in-app scheduler infrastructure.
 *
 * @module infrastructure/scheduler
 */

/**
 * A simple async function that represents a job.
 */
export type JobFunction = () => Promise<void>;

/**
 * Schedule definition.
 *
 * Returned by schedule factories and registered via DI.
 */
export interface Schedule {
  /**
   * Unique name identifying this schedule.
   * Used for locking (unless individual jobs are locked, which is the current implementation).
   * Note: Current lock scope is usually by job name, but the schedule name groups them.
   */
  name: string;

  /**
   * Cron expression.
   */
  cron: string;

  /**
   * List of functions to execute.
   */
  jobs: JobFunction[];
}

// Token for dependency injection
export const SCHEDULES_TOKEN = Symbol('SCHEDULES');

/**
 * Scheduler mode determines how jobs are scheduled.
 *
 * PRODUCTION (default): Uses cron expressions for fixed clock-time scheduling.
 * UPTIME_BASED: Uses setInterval for uptime-based scheduling (dev/test only).
 */
export enum SchedulerMode {
  /**
   * Fixed clock-time scheduling using cron expressions.
   * Jobs run at the same wall-clock time regardless of when the app started.
   * Use in production.
   */
  CRON = 'cron',

  /**
   * Uptime-based scheduling using setInterval.
   * Jobs run X time after the app starts, then every X time after.
   * ONLY use for local development and testing.
   *
   * ⚠️ WARNING: This mode causes schedule drift on restarts and deploys.
   * Do NOT use in production.
   */
  UPTIME_BASED = 'uptime-based',
}

/**
 * Interval types for uptime-based scheduling (dev/test only).
 */
export enum ScheduleInterval {
  /**
   * Execute every minute.
   */
  EVERY_MINUTE = 60 * 1000,

  /**
   * Execute every 5 minutes.
   */
  EVERY_5_MINUTES = 5 * 60 * 1000,

  /**
   * Execute every 15 minutes.
   */
  EVERY_15_MINUTES = 15 * 60 * 1000,

  /**
   * Execute every hour.
   */
  EVERY_HOUR = 60 * 60 * 1000,

  /**
   * Execute every 24 hours.
   */
  DAILY = 24 * 60 * 60 * 1000,
}
