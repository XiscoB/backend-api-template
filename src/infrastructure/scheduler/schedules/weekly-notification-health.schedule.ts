import { AppConfigService } from '../../../config/app-config.service';
import { WeeklyNotificationHealthReportJob } from '../../../modules/reports/jobs/weekly-notification-health-report.job';
import { Schedule } from '../scheduler.types';

export const createWeeklyNotificationHealthSchedule = (
  config: AppConfigService,
  job: WeeklyNotificationHealthReportJob,
): Schedule => {
  return {
    name: 'weekly-notification-health-report',
    cron: config.weeklyNotificationHealthReportCron,
    jobs: [
      async (): Promise<void> => {
        await job.run();
      },
    ],
  };
};
