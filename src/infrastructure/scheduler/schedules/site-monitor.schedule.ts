/**
 * Site Monitor Schedule Factory
 *
 * Periodic availability checks for external sites.
 *
 * RULES:
 * - Factory must be PURE WIRING ONLY.
 * - NO conditional logic or feature flags.
 *
 * @module infrastructure/scheduler/schedules
 */

import { AppConfigService } from '../../../config/app-config.service';
import { SiteMonitorJob } from '../jobs/site-monitor.job';
import { Schedule } from '../scheduler.types';

export const createSiteMonitorSchedule = (
  config: AppConfigService,
  siteMonitorJob: SiteMonitorJob,
): Schedule => {
  return {
    name: 'site-monitor',
    cron: config.siteMonitorCheckCron,
    jobs: [
      async (): Promise<void> => {
        await siteMonitorJob.run();
      },
    ],
  };
};
