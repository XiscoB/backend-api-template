/**
 * Daily Schedule Factory
 *
 * Handles daily maintenance jobs.
 *
 * RULES:
 * - Factory must be PURE WIRING ONLY.
 * - Map services to jobs.
 * - NO conditional logic or feature flags.
 *
 * @module infrastructure/scheduler/schedules
 */

import { AppConfigService } from '../../../config/app-config.service';
import { CleanupCronService } from '../../cleanup/cleanup-cron.service';
import { Schedule } from '../scheduler.types';

import { ReportsDigestJob } from '../../../modules/reports/jobs/reports-digest.job';

export const createDailySchedule = (
  config: AppConfigService,
  cleanup: CleanupCronService,
  reportsDigest: ReportsDigestJob,
): Schedule => {
  return {
    name: 'daily',
    cron: config.schedulerDailyCron,
    jobs: [
      // Run infrastructure cleanup
      async (): Promise<void> => {
        await cleanup.runAllCleanups();
      },

      // Run reports digest
      // ENABLED BY DEFAULT:
      // This job is read-only and explicitly returns early if there are 0 unresolved reports.
      // It is safe to keep enabled as it sends NO email when there is no work to do.
      // If you do not want this behavior, it is safe to remove this block.
      async (): Promise<void> => {
        await reportsDigest.run();
      },
    ],
  };
};
