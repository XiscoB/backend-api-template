import { Schedule } from '../scheduler.types';
import { WeeklyPlatformReliabilityReportJob } from '../../../modules/reports/jobs/weekly-platform-reliability-report.job';

/**
 * Creates the schedule for the Weekly Platform Reliability Report.
 * - Runs weekly on Monday at 9:00 AM UTC (or configured time).
 * - Depends on WeeklyPlatformReliabilityReportJob.
 */
export function createWeeklyPlatformReliabilitySchedule(
  job: WeeklyPlatformReliabilityReportJob,
): Schedule {
  return {
    name: 'weekly-platform-reliability-report',
    // Run at 09:00 on Monday.
    // Cron format: Minute Hour DayOfMonth Month DayOfWeek
    // 0 9 * * 1 = 9:00 AM every Monday
    cron: '0 9 * * 1',
    jobs: [
      async (): Promise<void> => {
        await job.run();
      },
    ],
  };
}
