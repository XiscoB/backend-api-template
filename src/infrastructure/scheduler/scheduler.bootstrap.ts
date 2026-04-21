/**
 * Scheduler Bootstrap Service
 *
 * Manages the lifecycle of the in-app scheduler.
 * Supports two modes:
 *
 * 1. CRON MODE (default, production):
 *    - Uses cron expressions for fixed clock-time scheduling
 *    - Jobs run at the same wall-clock time regardless of restarts
 *    - Uses DB-level locking for multi-instance safety
 *
 * 2. UPTIME-BASED MODE (dev/test only):
 *    - Uses setInterval for uptime-based scheduling
 *    - Jobs run X time after app start
 *    - ⚠️ Causes schedule drift on restarts - DO NOT use in production
 *
 * Architecture (from agents.md):
 * - Scheduler code is DISPOSABLE (can be replaced by external worker)
 * - Service code is PERMANENT
 * - Testing is EXPLICIT, never time-based
 *
 * @module infrastructure/scheduler
 */

import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Inject,
} from '@nestjs/common';
import * as cron from 'node-cron';
import { AppConfigService } from '../../config/app-config.service';
import { ScheduleInterval, Schedule, SchedulerMode, SCHEDULES_TOKEN } from './scheduler.types';
import { SchedulerLockService } from './scheduler-lock.service';

/**
 * Internal type for tracking active cron tasks.
 */
interface ActiveCronTask {
  jobName: string;
  cronExpression: string;
  task: cron.ScheduledTask;
}

/**
 * Internal type for tracking active interval timers (uptime-based mode).
 */
interface ActiveTimer {
  scheduleName: string;
  interval: ScheduleInterval;
  timerId: NodeJS.Timeout;
}

@Injectable()
export class SchedulerBootstrapService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerBootstrapService.name);
  private readonly activeCronTasks: ActiveCronTask[] = [];
  private readonly activeTimers: ActiveTimer[] = [];
  private isRunning = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly lockService: SchedulerLockService,
    @Inject(SCHEDULES_TOKEN) private readonly schedules: Schedule[],
  ) {}

  /**
   * Called when the application starts.
   * Registers and starts all schedules based on the configured mode.
   */
  onApplicationBootstrap(): void {
    if (!this.config.inAppSchedulerEnabled) {
      this.logger.log('In-app scheduler is DISABLED (IN_APP_SCHEDULER_ENABLED=false)');
      return;
    }

    // Startup diagnostics: log registered schedules
    const scheduleNames = this.schedules.map((s): string => s.name);
    this.logger.log(
      `Scheduler initializing: ${this.schedules.length} schedule(s) registered [${scheduleNames.join(', ')}]`,
    );

    const mode = this.config.schedulerMode;

    if (mode === SchedulerMode.UPTIME_BASED) {
      this.logger.warn(
        '⚠️ Scheduler is running in UPTIME-BASED mode. ' +
          'This mode causes schedule drift on restarts and should NOT be used in production.',
      );
      this.startUptimeBasedScheduler();
    } else {
      this.logger.log('Scheduler is running in CRON mode (fixed clock-time scheduling)');
      this.startCronScheduler();
    }

    this.isRunning = true;
  }

  /**
   * Called when the application is shutting down.
   * Stops all active schedules gracefully.
   */
  /**
   * Called when the application is shutting down.
   * Stops all active schedules gracefully.
   */
  onApplicationShutdown(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.log('Stopping in-app scheduler...');
    this.isRunning = false;

    // Stop cron tasks
    for (const task of this.activeCronTasks) {
      // stop() is void | Promise<void>, voiding it handles both cases without forcing async
      void task.task.stop();
      this.logger.debug(`Stopped cron task: ${task.jobName}`);
    }
    this.activeCronTasks.length = 0;

    // Stop interval timers
    for (const timer of this.activeTimers) {
      clearInterval(timer.timerId);
      this.logger.debug(`Stopped timer: ${timer.scheduleName}`);
    }
    this.activeTimers.length = 0;

    this.logger.log('Scheduler stopped');
  }

  /**
   * Start the scheduler in CRON mode (production).
   * Uses cron expressions for fixed clock-time scheduling.
   */
  private startCronScheduler(): void {
    for (const schedule of this.schedules) {
      this.registerCronSchedule(schedule);
    }

    this.logger.log(
      `Scheduler started with ${this.activeCronTasks.length} cron task(s): ` +
        this.activeCronTasks.map((t): string => `${t.jobName} (${t.cronExpression})`).join(', '),
    );
  }

  /**
   * Start the scheduler in UPTIME-BASED mode (dev/test only).
   * Uses setInterval for uptime-based scheduling.
   */
  private startUptimeBasedScheduler(): void {
    // For uptime-based mode, we iterate schedules and assign a default interval.
    // NOTE: This mode is dev-only and strictly approximates production behavior.
    // 'every-minute' -> EVERY_MINUTE
    // 'daily' -> DAILY

    for (const schedule of this.schedules) {
      let interval = ScheduleInterval.EVERY_MINUTE;
      if (schedule.name === 'daily') interval = ScheduleInterval.DAILY;
      else if (schedule.name === 'every-minute') interval = ScheduleInterval.EVERY_MINUTE;
      // Default fallback could be dangerous, so we stick to knowns or default to 1 min for dev

      this.registerIntervalSchedule(schedule, interval);
    }

    this.logger.log(
      `Scheduler started with ${this.activeTimers.length} interval timer(s): ` +
        this.activeTimers.map((t): string => t.scheduleName).join(', '),
    );
  }

  /**
   * Register a schedule with a cron expression.
   */
  private registerCronSchedule(schedule: Schedule): void {
    // Validate cron expression
    if (!cron.validate(schedule.cron)) {
      this.logger.error(`Invalid cron expression for ${schedule.name}: ${schedule.cron}`);
      return;
    }

    this.logger.debug(`Registering cron schedule: ${schedule.name} (${schedule.cron})`);

    // Create the cron task
    const task = cron.schedule(
      schedule.cron,
      (): void => {
        void this.executeJob(schedule);
      },
      {
        timezone: this.config.schedulerTimezone,
      },
    );

    // Track the active task
    this.activeCronTasks.push({
      jobName: schedule.name,
      cronExpression: schedule.cron,
      task,
    });

    this.logger.log(
      `Cron schedule registered: ${schedule.name} (${schedule.cron}, TZ: ${this.config.schedulerTimezone})`,
    );
  }

  /**
   * Execute a schedule's jobs with locking.
   */
  private async executeJob(schedule: Schedule): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    // Try to acquire lock
    // Lock scope is the schedule name.
    const lockResult = await this.lockService.acquireLock(schedule.name);

    if (!lockResult.acquired) {
      this.logger.debug(
        `Skipping ${schedule.name}: lock not acquired (another instance is running)`,
      );
      return;
    }

    try {
      const startTime = Date.now();

      // Execute all jobs in the schedule safely
      for (const job of schedule.jobs) {
        try {
          await job();
        } catch (jobError: unknown) {
          const jobErrorMessage = jobError instanceof Error ? jobError.message : String(jobError);
          this.logger.error(
            `Error executing a job in schedule ${schedule.name}: ${jobErrorMessage}`,
          );
          // Continue to next job in list
        }
      }

      const durationMs = Date.now() - startTime;
      this.logger.debug(`Schedule ${schedule.name} completed (${durationMs}ms)`);

      // Update last run time
      await this.lockService.updateLastRunTime(schedule.name);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Unhandled error in schedule ${schedule.name}: ${errorMessage}`);
    } finally {
      // Release lock
      await this.lockService.releaseLock(schedule.name);
    }
  }

  /**
   * Register a schedule with an interval (uptime-based mode).
   */
  private registerIntervalSchedule(schedule: Schedule, interval: ScheduleInterval): void {
    const intervalName = this.getIntervalName(interval);

    this.logger.debug(`Registering interval schedule: ${schedule.name} (${intervalName})`);

    // Create a wrapper that executes the schedule and handles errors
    const executeWrapper = async (): Promise<void> => {
      if (!this.isRunning) {
        return;
      }

      try {
        const startTime = Date.now();

        for (const job of schedule.jobs) {
          try {
            await job();
          } catch (jobError: unknown) {
            const jobErrorMessage = jobError instanceof Error ? jobError.message : String(jobError);
            this.logger.error(
              `Error executing a job in schedule ${schedule.name}: ${jobErrorMessage}`,
            );
          }
        }

        const durationMs = Date.now() - startTime;
        this.logger.debug(`Schedule ${schedule.name} completed successfully (${durationMs}ms)`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Unhandled error in schedule ${schedule.name}: ${errorMessage}`);
      }
    };

    // Start the interval timer
    const timerId = setInterval((): void => {
      void executeWrapper();
    }, interval);

    // Track the active timer
    this.activeTimers.push({
      scheduleName: schedule.name,
      interval,
      timerId,
    });

    this.logger.log(`Interval schedule registered: ${schedule.name} (${intervalName})`);
  }

  /**
   * Get a human-readable name for an interval.
   */
  private getIntervalName(interval: ScheduleInterval): string {
    switch (interval) {
      case ScheduleInterval.EVERY_MINUTE:
        return 'every minute';
      case ScheduleInterval.EVERY_5_MINUTES:
        return 'every 5 minutes';
      case ScheduleInterval.EVERY_15_MINUTES:
        return 'every 15 minutes';
      case ScheduleInterval.EVERY_HOUR:
        return 'every hour';
      case ScheduleInterval.DAILY:
        return 'daily (24h after start)';
      default:
        return `every ${String(interval as number)}ms`;
    }
  }

  /**
   * Check if the scheduler is currently running.
   * Useful for health checks and debugging.
   */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Get the current scheduler mode.
   */
  get mode(): SchedulerMode {
    return this.config.schedulerMode;
  }

  /**
   * Get the list of active schedules.
   * Useful for debugging and monitoring.
   */
  getActiveSchedules(): { name: string; schedule: string; mode: string }[] {
    const cronSchedules = this.activeCronTasks.map(
      (t): { name: string; schedule: string; mode: string } => ({
        name: t.jobName,
        schedule: t.cronExpression,
        mode: 'cron',
      }),
    );

    const intervalSchedules = this.activeTimers.map(
      (t): { name: string; schedule: string; mode: string } => ({
        name: t.scheduleName,
        schedule: this.getIntervalName(t.interval),
        mode: 'uptime-based',
      }),
    );

    return [...cronSchedules, ...intervalSchedules];
  }
}
