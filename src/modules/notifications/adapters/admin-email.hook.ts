import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationLog } from '@prisma/client';
import { z } from 'zod';
import { NotificationDeliveryHook } from '../notifications.types';
import { EmailService } from '../../../infrastructure/email/email.service';

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas for admin report notification payloads
// ─────────────────────────────────────────────────────────────────────────────

const ReportsDigestPayloadSchema = z.object({
  pendingCount: z.number(),
});

const BaseReportPayloadSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
  generatedAt: z.string(),
});

const WeeklyGrowthReportPayloadSchema = BaseReportPayloadSchema.extend({
  metrics: z.object({
    newUsers: z.number(),
    totalIdentities: z.number(),
    activeUsers: z.object({
      wau: z.number(),
      mau: z.number(),
      wauMauRatio: z.number(),
    }),
    dormancy: z.object({
      d30: z.number(),
      d60: z.number(),
      d90: z.number(),
    }),
  }),
});

const GdprComplianceReportPayloadSchema = BaseReportPayloadSchema.extend({
  overview: z.object({
    created: z.object({
      EXPORT: z.number(),
      DELETE: z.number(),
      SUSPEND: z.number(),
    }),
    completed: z.number(),
    failed: z.number(),
    expired: z.number(),
    pending: z.number(),
  }),
  performance: z.object({
    avgProcessingTimeMs: z.number(),
    maxProcessingTimeMs: z.number(),
    oldestPendingRequestAgeHours: z.number(),
    stuckRequestCount: z.number(),
  }),
  integrity: z.object({
    missingAuditLogs: z.number(),
    undeletedExpiredFiles: z.number(),
  }),
  legalHolds: z.object({
    activeCount: z.number(),
    expiringSoonCount: z.number(),
  }),
});

const JobExecutionStatSchema = z.object({
  jobName: z.string(),
  lastRunAt: z.string().nullable(),
  timeSinceLastRunMs: z.number().nullable(),
});

const ErrorSourceSchema = z.object({
  source: z.string(),
  count: z.number(),
});

const PlatformReliabilityReportPayloadSchema = BaseReportPayloadSchema.extend({
  scheduler: z.object({
    totalJobs: z.number(),
    jobsRunAtLeastOnce: z.number(),
    jobsNeverRun: z.number(),
    lockIntegrity: z.object({
      staleLocksCount: z.number(),
      longestLockHoldMs: z.number(),
    }),
    jobExecutionStats: z.array(JobExecutionStatSchema),
  }),
  backgroundErrors: z.object({
    totalLogs: z.number(),
    errorCount: z.number(),
    trend: z.string(),
    warnCount: z.number(),
    topErrorSources: z.array(ErrorSourceSchema),
  }),
});

const NotificationHealthReportPayloadSchema = BaseReportPayloadSchema.extend({
  volume: z.object({
    total: z.number(),
    trend: z.string(),
    previousWeekTotal: z.number(),
    byType: z.array(z.object({ type: z.string(), count: z.number() })),
  }),
  delivery: z.object({
    totalAttempts: z.number(),
    sent: z.number(),
    failed: z.number(),
    skipped: z.number(),
    failureRate: z.number(),
    trend: z.string(),
    previousWeekFailureRate: z.number(),
  }),
  channels: z.object({
    email: z.object({ count: z.number(), percent: z.number() }),
    push: z.object({ count: z.number(), percent: z.number() }),
    none: z.object({ count: z.number(), percent: z.number() }),
  }),
  failures: z.object({
    trend: z.string(),
    previousWeekFailures: z.number(),
    topEventTypes: z.array(z.object({ eventType: z.string(), count: z.number() })),
    topReasons: z.array(z.object({ reason: z.string(), count: z.number() })),
  }),
  configHealth: z.object({
    usersWithEmailChannel: z.number(),
    usersWithAllChannelsDisabled: z.number(),
    usersEnabledButNoActiveChannel: z.number(),
  }),
});

const SafetyModerationReportPayloadSchema = BaseReportPayloadSchema.extend({
  reportVolume: z.object({
    total: z.number(),
    trend: z.string(),
    previousWeekTotal: z.number(),
    byContentType: z.array(z.object({ contentType: z.string(), count: z.number() })),
    byCategory: z.array(z.object({ category: z.string(), count: z.number() })),
  }),
  throughput: z.object({
    resolvedThisWeek: z.number(),
    resolutionRate: z.number(),
    avgResolutionTimeHours: z.number().nullable(),
  }),
  backlog: z.object({
    total: z.number(),
    olderThan7Days: z.number(),
    olderThan14Days: z.number(),
    olderThan30Days: z.number(),
  }),
  outcomes: z.object({
    valid: z.number(),
    invalid: z.number(),
    pending: z.number(),
  }),
  identitySignals: z.object({
    flagged: z.number(),
    suspended: z.number(),
    banned: z.number(),
    totalFlaggedSuspendedBanned: z.number(),
  }),
});

/**
 * Admin Email Hook
 *
 * Listens for system notifications and sends emails to the configured admin address.
 */
@Injectable()
export class AdminEmailHook implements NotificationDeliveryHook {
  private readonly logger = new Logger(AdminEmailHook.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async onNotificationCreated(notification: NotificationLog): Promise<void> {
    // Generic Admin Notification Logic
    if (notification.type === 'ADMIN_REPORTS_DIGEST') {
      await this.handleReportsDigest(notification);
    } else if (notification.type === 'WEEKLY_GROWTH_REPORT') {
      await this.handleWeeklyGrowthReport(notification);
    } else if (notification.type === 'GDPR_COMPLIANCE_REPORT') {
      await this.handleGdprComplianceReport(notification);
    } else if (notification.type === 'WEEKLY_PLATFORM_RELIABILITY_REPORT') {
      await this.handleWeeklyPlatformReliabilityReport(notification);
    } else if (notification.type === 'WEEKLY_NOTIFICATION_HEALTH_REPORT') {
      await this.handleWeeklyNotificationHealthReport(notification);
    } else if (notification.type === 'WEEKLY_SAFETY_MODERATION_REPORT') {
      await this.handleWeeklySafetyModerationReport(notification);
    }
  }

  private async handleReportsDigest(notification: NotificationLog): Promise<void> {
    const adminEmail = this.configService.get<string>('EMAIL_ADMIN_EMAIL');

    if (!adminEmail) {
      this.logger.warn('Skipping Admin Email: EMAIL_ADMIN_EMAIL is not configured');
      return;
    }

    const [rawPayload] = [notification.payload] as [unknown];
    const payload = ReportsDigestPayloadSchema.parse(rawPayload);
    const count = payload.pendingCount ?? 0;
    const productName = this.configService.get<string>('EMAIL_PRODUCT_NAME', 'Backend Base');

    const subject = `[${productName}] Reports Digest: ${count} Pending`;
    const html = `
      <h1>Reports Digest</h1>
      <p>There are <strong>${count}</strong> unresolved reports waiting for review.</p>
      <p>Please log in to the admin console to review them.</p>
      <hr />
      <small>Generated at: ${new Date().toISOString()}</small>
    `;

    // Send using EmailService (Raw HTML mode)
    await this.emailService.send({
      recipients: [{ email: adminEmail }],
      rawSubject: subject,
      rawHtml: html,
      from: this.configService.get('EMAIL_DEFAULT_FROM')!, // Non-null assertion: verified by app config
    });

    this.logger.log(`Sent Admin Reports Digest to ${adminEmail}`);
  }

  private async handleWeeklyGrowthReport(notification: NotificationLog): Promise<void> {
    const recipients = this.configService.get<string>('WEEKLY_REPORT_RECIPIENTS');

    if (!recipients) {
      this.logger.warn('Skipping Weekly Growth Report: WEEKLY_REPORT_RECIPIENTS is not configured');
      return;
    }

    const [rawPayload] = [notification.payload] as [unknown];
    const payload = WeeklyGrowthReportPayloadSchema.parse(rawPayload);
    const metrics = payload.metrics;
    const productName = this.configService.get<string>('EMAIL_PRODUCT_NAME', 'Backend Base');
    const periodStart = new Date(payload.periodStart).toLocaleDateString('en-US');
    const periodEnd = new Date(payload.periodEnd).toLocaleDateString('en-US');

    const subject = `[${productName}] Weekly Growth Report - ${periodStart}`;

    // Simple Markdown/Text Body
    // We use a simple pre-formatted style or basic HTML for email compatibility.
    const html = `
      <h1>Weekly Growth & Activity Report</h1>
      <p><strong>Period:</strong> ${periodStart} - ${periodEnd}</p>
      <hr />
      
      <h2>1. Growth Summary</h2>
      <ul>
        <li><strong>New Users:</strong> ${metrics.newUsers}</li>
        <li><strong>Total Identities:</strong> ${metrics.totalIdentities}</li>
      </ul>

      <h2>2. Activity Snapshot</h2>
      <ul>
        <li><strong>WAU (Active 7d):</strong> ${metrics.activeUsers.wau}</li>
        <li><strong>MAU (Active 30d):</strong> ${metrics.activeUsers.mau}</li>
        <li><strong>WAU / MAU Ratio:</strong> ${metrics.activeUsers.wauMauRatio}%</li>
      </ul>

      <h2>3. Dormancy Overview</h2>
      <ul>
        <li><strong>Inactive &ge; 30 days:</strong> ${metrics.dormancy.d30}</li>
        <li><strong>Inactive &ge; 60 days:</strong> ${metrics.dormancy.d60}</li>
        <li><strong>Inactive &ge; 90 days:</strong> ${metrics.dormancy.d90}</li>
      </ul>

      <hr />
      <h3>Notes</h3>
      <p style="font-size: 0.9em; color: #666;">
        Activity is derived from lastActivity timestamp.<br>
        Metrics exclude anonymized identities.<br>
        This is not behavioral analytics.
      </p>
      <small>Generated at: ${payload.generatedAt}</small>
    `;

    const recipientList = recipients
      .split(',')
      .map((email) => ({ email: email.trim() }))
      .filter((r) => r.email);

    if (recipientList.length === 0) {
      this.logger.warn('Skipping Weekly Growth Report: No valid recipients found');
      return;
    }

    // Send using EmailService (Raw HTML mode)
    // We send individual emails or batch depending on service capabilities.
    // EmailService.send accepts array of recipients.
    await this.emailService.send({
      recipients: recipientList,
      rawSubject: subject,
      rawHtml: html,
      from: this.configService.get('EMAIL_DEFAULT_FROM')!,
    });

    this.logger.log(`Sent Weekly Growth Report to ${recipientList.length} recipients`);
  }

  private async handleGdprComplianceReport(notification: NotificationLog): Promise<void> {
    const recipients = this.configService.get<string>('GDPR_REPORT_RECIPIENTS');

    if (!recipients || recipients.trim() === '') {
      this.logger.warn(
        'Skipping GDPR Compliance Report: GDPR_REPORT_RECIPIENTS is not configured (STRICT MODE)',
      );
      return;
    }

    const recipientList = recipients
      .split(',')
      .map((email) => ({ email: email.trim() }))
      .filter((r) => r.email);

    if (recipientList.length === 0) {
      this.logger.warn(
        'Skipping GDPR Compliance Report: No valid recipients found in configuration',
      );
      return;
    }

    const [rawPayload] = [notification.payload] as [unknown];
    const payload = GdprComplianceReportPayloadSchema.parse(rawPayload);
    const productName = this.configService.get<string>('EMAIL_PRODUCT_NAME', 'Backend Base');
    const periodStart = new Date(payload.periodStart).toLocaleDateString('en-US');
    const periodEnd = new Date(payload.periodEnd).toLocaleDateString('en-US');

    const subject = `[${productName}] Weekly GDPR Compliance Report - ${periodStart}`;

    const overview = payload.overview;
    const perf = payload.performance;
    const integrity = payload.integrity;
    const holds = payload.legalHolds;

    const html = `
      <h1>Weekly GDPR Compliance Report</h1>
      <p><strong>Period:</strong> ${periodStart} - ${periodEnd}</p>
      <hr />

      <h2>1. Request Overview</h2>
      <ul>
        <li><strong>Created:</strong> Export: ${overview.created.EXPORT}, Delete: ${overview.created.DELETE}, Suspend: ${overview.created.SUSPEND}</li>
        <li><strong>Completed:</strong> ${overview.completed}</li>
        <li><strong>Failed:</strong> ${overview.failed}</li>
        <li><strong>Expired:</strong> ${overview.expired}</li>
        <li><strong>Pending (Current):</strong> ${overview.pending}</li>
      </ul>

      <h2>2. Processing Performance</h2>
      <ul>
        <li><strong>Avg Processing Time:</strong> ${Math.round(perf.avgProcessingTimeMs / 1000)}s</li>
        <li><strong>Max Processing Time:</strong> ${Math.round(perf.maxProcessingTimeMs / 1000)}s</li>
        <li><strong>Oldest Pending Request:</strong> ${perf.oldestPendingRequestAgeHours} hours</li>
        <li><strong>Stuck Requests (>24h):</strong> ${perf.stuckRequestCount}</li>
      </ul>

      <h2>3. Integrity Checks (Expected: 0)</h2>
      <ul>
        <li><strong>Completed Requests w/ Missing Audit Logs:</strong> ${integrity.missingAuditLogs}</li>
        <li><strong>Expired Files Not Deleted:</strong> ${integrity.undeletedExpiredFiles}</li>
      </ul>

      <h2>4. Deletion Legal Holds</h2>
      <ul>
        <li><strong>Active Holds:</strong> ${holds.activeCount}</li>
        <li><strong>Expiring Soon (14d):</strong> ${holds.expiringSoonCount}</li>
      </ul>

      <hr />
      <h3>Notes</h3>
      <p style="font-size: 0.9em; color: #666;">
        This report is informational only.<br>
        Non-zero integrity values require investigation.<br>
        No personal data is included.
      </p>
      <small>Generated at: ${payload.generatedAt}</small>
    `;

    await this.emailService.send({
      recipients: recipientList,
      rawSubject: subject,
      rawHtml: html,
      from: this.configService.get('EMAIL_DEFAULT_FROM')!,
    });

    this.logger.log(`Sent GDPR Compliance Report to ${recipientList.length} recipients`);
  }

  private async handleWeeklyPlatformReliabilityReport(
    notification: NotificationLog,
  ): Promise<void> {
    const recipients = this.configService.get<string>('PLATFORM_REPORT_RECIPIENTS');

    if (!recipients) {
      // Fail-safe: Log warning but do not throw
      this.logger.warn({
        message:
          'Skipping Weekly Platform Reliability Report: PLATFORM_REPORT_RECIPIENTS is not configured',
        job: 'WeeklyPlatformReliabilityReportJob',
        reason: 'Missing recipient configuration',
      });
      return;
    }

    const recipientList = recipients
      .split(',')
      .map((email) => ({ email: email.trim() }))
      .filter((r) => r.email);

    if (recipientList.length === 0) {
      this.logger.warn({
        message: 'Skipping Weekly Platform Reliability Report: No valid recipients found',
        job: 'WeeklyPlatformReliabilityReportJob',
        reason: 'Empty recipient list',
      });
      return;
    }

    const [rawPayload] = [notification.payload] as [unknown];
    const payload = PlatformReliabilityReportPayloadSchema.parse(rawPayload);
    const productName = this.configService.get<string>('EMAIL_PRODUCT_NAME', 'Backend Base');
    const periodStart = new Date(payload.periodStart).toLocaleDateString('en-US');
    const periodEnd = new Date(payload.periodEnd).toLocaleDateString('en-US');

    const subject = `[${productName}] Platform Reliability: ${periodStart} - ${periodEnd}`;

    const scheduler = payload.scheduler;
    const errors = payload.backgroundErrors;

    const html = `
      <h1>Platform Reliability Report</h1>
      <p><strong>Period:</strong> ${periodStart} - ${periodEnd}</p>
      <hr />

      <h2>1. Scheduler Execution</h2>
      <ul>
        <li><strong>Registered Jobs:</strong> ${scheduler.totalJobs}</li>
        <li><strong>Active (Run >= 1):</strong> ${scheduler.jobsRunAtLeastOnce}</li>
        <li><strong>Inactive (Never Run):</strong> ${scheduler.jobsNeverRun}</li>
        <li><strong>Lock Integrity:</strong> ${scheduler.lockIntegrity.staleLocksCount} available/stale, Max hold: ${Math.round(scheduler.lockIntegrity.longestLockHoldMs / 1000)}s</li>
      </ul>

      <h3>Job Delays (Time Since Last Run)</h3>
      <table style="width: 100%; text-align: left; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="border-bottom: 1px solid #ddd;">Job Name</th>
            <th style="border-bottom: 1px solid #ddd;">Last Run</th>
            <th style="border-bottom: 1px solid #ddd;">Delay</th>
          </tr>
        </thead>
        <tbody>
          ${scheduler.jobExecutionStats
            .map(
              (job) => `
            <tr>
              <td>${job.jobName}</td>
              <td>${job.lastRunAt ? new Date(job.lastRunAt).toLocaleString('en-US') : 'NEVER'}</td>
              <td>${job.timeSinceLastRunMs ? Math.round(job.timeSinceLastRunMs / 1000 / 60) + 'm' : '-'}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>

      <h2>2. Background Error Signal</h2>
      <ul>
        <li><strong>Total Logs:</strong> ${errors.totalLogs}</li>
        <li><strong>Errors:</strong> ${errors.errorCount} (${errors.trend})</li>
        <li><strong>Warnings:</strong> ${errors.warnCount}</li>
      </ul>

      <h3>Top Error Sources</h3>
      <ul>
        ${errors.topErrorSources.map((s) => `<li><strong>${s.source}:</strong> ${s.count}</li>`).join('') || '<li>None</li>' /* Intentionally using || for empty array fallback */}
      </ul>

      <hr />
      <h3>Report Confidence Notes</h3>
      <p style="font-size: 0.9em; color: #666;">
        Delay metrics are based on current scheduler state, not historical execution times.<br>
        This report is informational and does not represent alert conditions.
      </p>
      <small>Generated at: ${payload.generatedAt}</small>
    `;

    await this.emailService.send({
      recipients: recipientList,
      rawSubject: subject,
      rawHtml: html,
      from: this.configService.get('EMAIL_DEFAULT_FROM')!,
    });

    this.logger.log(
      `Sent Weekly Platform Reliability Report to ${recipientList.length} recipients`,
    );
  }

  private async handleWeeklyNotificationHealthReport(notification: NotificationLog): Promise<void> {
    const recipients = this.configService.get<string>('NOTIFICATION_HEALTH_REPORT_RECIPIENTS');

    if (!recipients || recipients.trim() === '') {
      this.logger.warn({
        message:
          'Skipping Weekly Notification Health Report: NOTIFICATION_HEALTH_REPORT_RECIPIENTS is not configured',
        job: 'WeeklyNotificationHealthReportJob',
        reason: 'Missing recipient configuration',
      });
      return;
    }

    const recipientList = recipients
      .split(',')
      .map((email) => ({ email: email.trim() }))
      .filter((r) => r.email);

    if (recipientList.length === 0) {
      this.logger.warn({
        message: 'Skipping Weekly Notification Health Report: No valid recipients found',
        job: 'WeeklyNotificationHealthReportJob',
        reason: 'Empty recipient list',
      });
      return;
    }

    const [rawPayload] = [notification.payload] as [unknown];
    const payload = NotificationHealthReportPayloadSchema.parse(rawPayload);
    const productName = this.configService.get<string>('EMAIL_PRODUCT_NAME', 'Backend Base');
    const periodStart = new Date(payload.periodStart).toLocaleDateString('en-US');
    const periodEnd = new Date(payload.periodEnd).toLocaleDateString('en-US');

    const subject = `[${productName}] Notification Health Report: ${periodStart} - ${periodEnd}`;

    const volume = payload.volume;
    const delivery = payload.delivery;
    const channels = payload.channels;
    const failures = payload.failures;
    const configHealth = payload.configHealth;

    const html = `
      <h1>Weekly Notification Health Report</h1>
      <p><strong>Period:</strong> ${periodStart} - ${periodEnd}</p>
      <hr />

      <h2>1. Notification Volume</h2>
      <ul>
        <li><strong>Total Created:</strong> ${volume.total} (${volume.trend} vs prev week: ${volume.previousWeekTotal})</li>
      </ul>
      <h3>Top Types</h3>
      <ul>
        ${
          volume.byType
            .slice(0, 5)
            .map((t: { type: string; count: number }) => `<li>${t.type}: ${t.count}</li>`)
            .join('') || '<li>None</li>' /* Intentionally using || for empty array fallback */
        }
      </ul>

      <h2>2. Delivery Outcomes</h2>
      <ul>
        <li><strong>Total Attempts:</strong> ${delivery.totalAttempts}</li>
        <li><strong>SENT:</strong> ${delivery.sent}</li>
        <li><strong>FAILED:</strong> ${delivery.failed}</li>
        <li><strong>SKIPPED:</strong> ${delivery.skipped}</li>
        <li><strong>Failure Rate:</strong> ${delivery.failureRate}% (${delivery.trend} vs prev: ${delivery.previousWeekFailureRate}%)</li>
      </ul>
      <p style="font-size: 0.85em; color: #666; margin-top: 0;">
        <em>Note: SKIPPED indicates no delivery attempt was made (e.g. no active channels or notifications disabled), not a delivery failure.</em>
      </p>

      <h2>3. Channel Usage</h2>
      <table style="width: 100%; text-align: left; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="border-bottom: 1px solid #ddd;">Channel</th>
            <th style="border-bottom: 1px solid #ddd;">Count</th>
            <th style="border-bottom: 1px solid #ddd;">%</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>EMAIL</td><td>${channels.email.count}</td><td>${channels.email.percent}%</td></tr>
          <tr><td>PUSH</td><td>${channels.push.count}</td><td>${channels.push.percent}%</td></tr>
          <tr><td>NONE</td><td>${channels.none.count}</td><td>${channels.none.percent}%</td></tr>
        </tbody>
      </table>

      <h2>4. Failure Analysis</h2>
      <p><strong>Total Failures:</strong> ${delivery.failed} (${failures.trend} vs prev: ${failures.previousWeekFailures})</p>
      <h3>Top Failing Event Types</h3>
      <ul>
        ${failures.topEventTypes.map((e: { eventType: string; count: number }) => `<li>${e.eventType}: ${e.count}</li>`).join('') || '<li>None</li>' /* Intentionally using || for empty array fallback */}
      </ul>
      <h3>Top Failure Reasons</h3>
      <ul>
        ${failures.topReasons.map((r: { reason: string; count: number }) => `<li>${r.reason}: ${r.count}</li>`).join('') || '<li>None</li>' /* Intentionally using || for empty array fallback */}
      </ul>

      <h2>5. Configuration Health</h2>
      <ul>
        <li><strong>Users with Email Channel:</strong> ${configHealth.usersWithEmailChannel}</li>
        <li><strong>Users with All Channels Disabled:</strong> ${configHealth.usersWithAllChannelsDisabled}</li>
        <li><strong>Users Enabled but No Active Channel:</strong> ${configHealth.usersEnabledButNoActiveChannel}</li>
      </ul>
      <p style="font-size: 0.85em; color: #666; margin-top: 0;">
        <em>Note: "Active" means enabled=true for transactional notifications. This explains silent skips.</em>
      </p>

      <hr />
      <h3>Notes</h3>
      <p style="font-size: 0.9em; color: #666;">
        This report is informational only.<br>
        High SKIPPED counts usually indicate configuration issues, not delivery failures.<br>
        Failure trends are compared week-over-week.
      </p>
      <small>Generated at: ${payload.generatedAt}</small>
    `;

    await this.emailService.send({
      recipients: recipientList,
      rawSubject: subject,
      rawHtml: html,
      from: this.configService.get('EMAIL_DEFAULT_FROM')!,
    });

    this.logger.log(`Sent Weekly Notification Health Report to ${recipientList.length} recipients`);
  }

  private async handleWeeklySafetyModerationReport(notification: NotificationLog): Promise<void> {
    const recipients = this.configService.get<string>('SAFETY_MODERATION_REPORT_RECIPIENTS');

    if (!recipients || recipients.trim() === '') {
      this.logger.warn({
        message:
          'Skipping Weekly Safety & Moderation Report: SAFETY_MODERATION_REPORT_RECIPIENTS is not configured',
        job: 'WeeklySafetyModerationReportJob',
        reason: 'Missing recipient configuration',
      });
      return;
    }

    const recipientList = recipients
      .split(',')
      .map((email) => ({ email: email.trim() }))
      .filter((r) => r.email);

    if (recipientList.length === 0) {
      this.logger.warn({
        message: 'Skipping Weekly Safety & Moderation Report: No valid recipients found',
        job: 'WeeklySafetyModerationReportJob',
        reason: 'Empty recipient list',
      });
      return;
    }

    const [rawPayload] = [notification.payload] as [unknown];
    const payload = SafetyModerationReportPayloadSchema.parse(rawPayload);
    const productName = this.configService.get<string>('EMAIL_PRODUCT_NAME', 'Backend Base');
    const periodStart = new Date(payload.periodStart).toLocaleDateString('en-US');
    const periodEnd = new Date(payload.periodEnd).toLocaleDateString('en-US');

    const subject = `[${productName}] Safety & Moderation Report: ${periodStart} - ${periodEnd}`;

    const volume = payload.reportVolume;
    const throughput = payload.throughput;
    const backlog = payload.backlog;
    const outcomes = payload.outcomes;
    const identity = payload.identitySignals;

    const html = `
      <h1>Weekly Safety & Moderation Report</h1>
      <p><strong>Period:</strong> ${periodStart} - ${periodEnd}</p>
      <hr />

      <h2>1. Report Volume</h2>
      <ul>
        <li><strong>Reports Created:</strong> ${volume.total} (${volume.trend} vs prev: ${volume.previousWeekTotal})</li>
      </ul>
      <h3>By Content Type</h3>
      <ul>
        ${
          volume.byContentType
            .slice(0, 5)
            .map(
              (t: { contentType: string; count: number }) =>
                `<li>${t.contentType}: ${t.count}</li>`,
            )
            .join('') || '<li>None</li>' /* Intentionally using || for empty array fallback */
        }
      </ul>
      <h3>By Category</h3>
      <ul>
        ${
          volume.byCategory
            .slice(0, 5)
            .map((c: { category: string; count: number }) => `<li>${c.category}: ${c.count}</li>`)
            .join('') || '<li>None</li>' /* Intentionally using || for empty array fallback */
        }
      </ul>

      <h2>2. Moderation Throughput</h2>
      <ul>
        <li><strong>Resolved This Week:</strong> ${throughput.resolvedThisWeek}</li>
        <li><strong>Resolution Rate:</strong> ${throughput.resolutionRate}%</li>
        <li><strong>Avg Resolution Time:</strong> ${throughput.avgResolutionTimeHours !== null ? throughput.avgResolutionTimeHours + ' hours' : 'N/A'}</li>
      </ul>

      <h2>3. Moderation Backlog</h2>
      <ul>
        <li><strong>Total Unresolved:</strong> ${backlog.total}</li>
        <li><strong>Older than 7 days:</strong> ${backlog.olderThan7Days}</li>
        <li><strong>Older than 14 days:</strong> ${backlog.olderThan14Days}</li>
        <li><strong>Older than 30 days:</strong> ${backlog.olderThan30Days}</li>
      </ul>
      <p style="font-size: 0.85em; color: #666; margin-top: 0;">
        <em>Note: Backlog includes reports where resolved = false regardless of age. Soft-deleted reports are excluded.</em>
      </p>

      <h2>4. Resolution Outcomes</h2>
      <ul>
        <li><strong>Valid (Actionable):</strong> ${outcomes.valid}</li>
        <li><strong>Invalid (Dismissed):</strong> ${outcomes.invalid}</li>
        <li><strong>Pending Review:</strong> ${outcomes.pending}</li>
      </ul>

      <h2>5. Identity Safety Signals</h2>
      <ul>
        <li><strong>Flagged:</strong> ${identity.flagged}</li>
        <li><strong>Suspended:</strong> ${identity.suspended}</li>
        <li><strong>Banned:</strong> ${identity.banned}</li>
        <li><strong>Total:</strong> ${identity.totalFlaggedSuspendedBanned}</li>
      </ul>
      <p style="font-size: 0.85em; color: #666; margin-top: 0;">
        <em>Note: Counts reflect current identity state, not newly flagged this week.</em>
      </p>

      <hr />
      <h3>Notes</h3>
      <p style="font-size: 0.9em; color: #666;">
        This report is observational only. Numbers are presented without interpretation.<br>
        No policy or legal claims are implied.<br>
        For questions, contact your operations team.
      </p>
      <small>Generated at: ${payload.generatedAt}</small>
    `;

    await this.emailService.send({
      recipients: recipientList,
      rawSubject: subject,
      rawHtml: html,
      from: this.configService.get('EMAIL_DEFAULT_FROM')!,
    });

    this.logger.log(`Sent Weekly Safety & Moderation Report to ${recipientList.length} recipients`);
  }
}
