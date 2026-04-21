/**
 * Scheduler Module
 *
 * Provides in-app scheduling infrastructure for background jobs.
 *
 * ARCHITECTURE (from agents.md):
 * - Scheduler code is DISPOSABLE (can be replaced by Option 7 worker)
 * - Service code is PERMANENT
 * - Testing is EXPLICIT, never time-based
 *
 * SCHEDULING MODES:
 * - CRON (default): Fixed clock-time scheduling using cron expressions
 * - UPTIME_BASED: Interval-based scheduling (dev/test only)
 *
 * MULTI-INSTANCE SAFETY:
 * - Uses DB-level locking to ensure only one instance runs a job
 * - Lock has TTL to prevent deadlocks from crashed processes
 *
 * @see docs/canonical/SCHEDULING.md
 * @module infrastructure/scheduler
 */

import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/app-config.module';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { NotificationsModule } from '../../modules/notifications/notifications.module';
import { CleanupModule } from '../cleanup/cleanup.module';
import { NotificationsCronService } from '../../modules/notifications/notifications-cron.service';
// import { DeliveryRetryService } from '../../modules/notifications/delivery-retry.service';
import { CleanupCronService } from '../cleanup/cleanup-cron.service';

import { ReportsModule } from '../../modules/reports/reports.module';
import { ReportsDigestJob } from '../../modules/reports/jobs/reports-digest.job';
import { DeliveryModule } from '../delivery';

import { SchedulerBootstrapService } from './scheduler.bootstrap';
import { SchedulerLockService } from './scheduler-lock.service';
import { PostgresSchedulerLockService } from './postgres-scheduler-lock.service';
import { SchedulerAlertsJob } from './jobs/scheduler-alerts.job';
import { createEveryMinuteSchedule } from './schedules/every-minute.schedule';
import { createDailySchedule } from './schedules/daily.schedule';
import { createGdprIntegritySchedule } from './schedules/gdpr-integrity.schedule';
import { SCHEDULES_TOKEN } from './scheduler.types';
import { GdprModule } from '../../modules/gdpr/gdpr.module';
import { GdprIntegrityMonitor } from '../../modules/gdpr/integrity/gdpr-integrity.monitor';
import { createWeeklyGrowthSchedule } from './schedules/weekly-growth.schedule';
import { WeeklyGrowthReportJob } from '../../modules/reports/jobs/weekly-growth-report.job';
import { createGdprComplianceSchedule } from './schedules/gdpr-compliance.schedule';
import { GdprComplianceReportJob } from '../../modules/gdpr/reporting/gdpr-compliance-report.job';
import { createWeeklyPlatformReliabilitySchedule } from './schedules/weekly-platform-reliability.schedule';
import { WeeklyPlatformReliabilityReportJob } from '../../modules/reports/jobs/weekly-platform-reliability-report.job';
import { createWeeklyNotificationHealthSchedule } from './schedules/weekly-notification-health.schedule';
import { WeeklyNotificationHealthReportJob } from '../../modules/reports/jobs/weekly-notification-health-report.job';
import { createWeeklySafetyModerationSchedule } from './schedules/weekly-safety-moderation.schedule';
import { WeeklySafetyModerationReportJob } from '../../modules/reports/jobs/weekly-safety-moderation-report.job';
import { SiteMonitorJob } from './jobs/site-monitor.job';
import { createSiteMonitorSchedule } from './schedules/site-monitor.schedule';

@Module({
  imports: [
    // Configuration for environment checks
    AppConfigModule,

    // Prisma for DB-level locking
    PrismaModule,

    // Notification services for every-minute schedule
    NotificationsModule,

    // Cleanup services for daily schedule
    CleanupModule,

    // Reports services for daily digest
    ReportsModule,

    // GDPR services for integrity monitoring
    GdprModule,

    // Delivery infrastructure for alert emails
    DeliveryModule,
  ],
  providers: [
    // NOTE: SchedulerLockService is intentionally backed by PostgreSQL.
    // Redis or other implementations may be added in the future,
    // but Postgres remains the default and only implementation today.
    {
      provide: SchedulerLockService,
      useClass: PostgresSchedulerLockService,
    },

    // Scheduler Safety Alerts
    SchedulerAlertsJob,

    // Site Monitor Job
    SiteMonitorJob,

    // -------------------------------------------------------------------------
    // SCHEDULE REGISTRATION
    // -------------------------------------------------------------------------
    // Schedules are registered via DI using the SCHEDULES_TOKEN.
    // Factories must be PURE WIRING (no conditionals).
    // -------------------------------------------------------------------------

    {
      provide: SCHEDULES_TOKEN,
      useFactory: createEveryMinuteSchedule,
      inject: [AppConfigService, NotificationsCronService, SchedulerAlertsJob],
    },
    {
      provide: SCHEDULES_TOKEN,
      useFactory: createDailySchedule,
      inject: [AppConfigService, CleanupCronService, ReportsDigestJob],
    },
    {
      provide: SCHEDULES_TOKEN,
      useFactory: createGdprIntegritySchedule,
      inject: [AppConfigService, GdprIntegrityMonitor],
    },
    {
      provide: SCHEDULES_TOKEN,
      useFactory: createWeeklyGrowthSchedule,
      inject: [AppConfigService, WeeklyGrowthReportJob],
    },
    {
      provide: SCHEDULES_TOKEN,
      useFactory: createWeeklyPlatformReliabilitySchedule,
      inject: [WeeklyPlatformReliabilityReportJob],
    },
    {
      provide: SCHEDULES_TOKEN,
      useFactory: createGdprComplianceSchedule,
      inject: [AppConfigService, GdprComplianceReportJob],
    },
    {
      provide: SCHEDULES_TOKEN,
      useFactory: createWeeklyNotificationHealthSchedule,
      inject: [AppConfigService, WeeklyNotificationHealthReportJob],
    },
    {
      provide: SCHEDULES_TOKEN,
      useFactory: createWeeklySafetyModerationSchedule,
      inject: [AppConfigService, WeeklySafetyModerationReportJob],
    },
    {
      provide: SCHEDULES_TOKEN,
      useFactory: createSiteMonitorSchedule,
      inject: [AppConfigService, SiteMonitorJob],
    },

    // Bootstrap service (generic runner)
    SchedulerBootstrapService,
  ],
  exports: [
    // Export for potential health checks or debugging
    SchedulerBootstrapService,
    SchedulerLockService,
  ],
})
export class SchedulerModule {}
