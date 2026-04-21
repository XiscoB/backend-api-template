import { AppConfigService } from '../../../config/app-config.service';
import { WeeklySafetyModerationReportJob } from '../../../modules/reports/jobs/weekly-safety-moderation-report.job';
import { Schedule } from '../scheduler.types';

export const createWeeklySafetyModerationSchedule = (
  config: AppConfigService,
  job: WeeklySafetyModerationReportJob,
): Schedule => {
  return {
    name: 'weekly-safety-moderation-report',
    cron: config.weeklySafetyModerationReportCron,
    jobs: [
      async (): Promise<void> => {
        await job.run();
      },
    ],
  };
};
