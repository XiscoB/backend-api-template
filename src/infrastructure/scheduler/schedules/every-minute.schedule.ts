/**
 * Every-Minute Schedule Factory
 *
 * Handles time-sensitive background jobs.
 *
 * RULES:
 * - Factory must be PURE WIRING ONLY.
 * - Map services to jobs.
 * - NO conditional logic or feature flags.
 *
 * @module infrastructure/scheduler/schedules
 */

import { AppConfigService } from '../../../config/app-config.service';
import { NotificationsCronService } from '../../../modules/notifications/notifications-cron.service';
import { SchedulerAlertsJob } from '../jobs/scheduler-alerts.job';
import { Schedule } from '../scheduler.types';

export const createEveryMinuteSchedule = (
  config: AppConfigService,
  notifications: NotificationsCronService,
  schedulerAlerts: SchedulerAlertsJob,
): Schedule => {
  return {
    name: 'every-minute',
    cron: config.schedulerEveryMinuteCron,
    jobs: [
      // Process pending notifications
      async (): Promise<void> => {
        await notifications.processPendingNotifications();
      },

      // Scheduler Safety Alerts
      // Checks for stalled jobs, locks, and error rates
      async (): Promise<void> => {
        await schedulerAlerts.run();
      },
    ],
  };
};
