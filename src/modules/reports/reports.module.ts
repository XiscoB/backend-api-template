import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { ReportsCronService } from './reports.cron.service';
import { ReportsDigestJob } from './jobs/reports-digest.job';
import { WeeklyGrowthReportJob } from './jobs/weekly-growth-report.job';
import { WeeklyPlatformReliabilityReportJob } from './jobs/weekly-platform-reliability-report.job';
import { WeeklyNotificationHealthReportJob } from './jobs/weekly-notification-health-report.job';
import { WeeklySafetyModerationReportJob } from './jobs/weekly-safety-moderation-report.job';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, GdprModule, IdentityModule, NotificationsModule],
  providers: [
    ReportsService,
    ReportsCronService,
    ReportsDigestJob,
    WeeklyGrowthReportJob,
    WeeklyPlatformReliabilityReportJob,
    WeeklyNotificationHealthReportJob,
    WeeklySafetyModerationReportJob,
  ],
  exports: [
    ReportsService,
    ReportsCronService,
    ReportsDigestJob,
    WeeklyGrowthReportJob,
    WeeklyPlatformReliabilityReportJob,
    WeeklyNotificationHealthReportJob,
    WeeklySafetyModerationReportJob,
  ],
})
export class ReportsModule {}
