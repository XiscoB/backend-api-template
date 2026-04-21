/**
 * Scheduler Infrastructure
 *
 * In-app scheduler for background job execution.
 * Environment-gated via IN_APP_SCHEDULER_ENABLED.
 *
 * MODES:
 * - CRON (default): Fixed clock-time scheduling
 * - UPTIME_BASED: Interval-based scheduling (dev only)
 *
 * IMPORTANT:
 * - Scheduler code is DISPOSABLE
 * - Service code is PERMANENT
 * - Testing is EXPLICIT, never time-based
 *
 * @see docs/canonical/SCHEDULING.md
 * @module infrastructure/scheduler
 */

export * from './scheduler.types';
export * from './scheduler-lock.service';
export * from './scheduler.bootstrap';
export * from './scheduler.module';
export * from './schedules';
