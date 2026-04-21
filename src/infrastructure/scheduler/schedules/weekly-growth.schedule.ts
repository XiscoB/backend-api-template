import { AppConfigService } from '../../../config/app-config.service';
import { WeeklyGrowthReportJob } from '../../../modules/reports/jobs/weekly-growth-report.job';
import { Schedule } from '../scheduler.types';

export const createWeeklyGrowthSchedule = (
  config: AppConfigService,
  job: WeeklyGrowthReportJob,
): Schedule => {
  return {
    name: 'weekly-growth-report',
    cron: config.weeklyGrowthReportCron,
    jobs: [
      async (): Promise<void> => {
        await job.run();
      },
    ],
  };
};
