import { AppConfigService } from '../../../config/app-config.service';
import { GdprComplianceReportJob } from '../../../modules/gdpr/reporting/gdpr-compliance-report.job';
import { Schedule } from '../scheduler.types';

export const createGdprComplianceSchedule = (
  config: AppConfigService,
  job: GdprComplianceReportJob,
): Schedule => {
  return {
    name: 'gdpr-compliance-report',
    cron: config.gdprComplianceReportCron,
    jobs: [
      async (): Promise<void> => {
        await job.run();
      },
    ],
  };
};
