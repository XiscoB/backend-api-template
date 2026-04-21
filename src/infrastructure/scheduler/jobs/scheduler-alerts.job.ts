import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AlertDeliveryService, RecipientGroup } from '../../delivery';

/**
 * Scheduler Safety Alerts Job
 *
 * DETECTS:
 * 1. Jobs not running (missed schedules)
 * 2. Stuck running jobs
 * 3. Orphaned scheduler locks (cleanup failure)
 * 4. Repeated job errors (instability)
 *
 * FREQUENCY:
 * Runs every minute to ensure fast detection.
 *
 * ALERTS:
 * Uses AlertDeliveryService to send emails to INFRA_ALERT_RECIPIENTS.
 * Rate-limited via InternalLog to prevent spam (30m debounce).
 *
 * @see task.md
 */
@Injectable()
export class SchedulerAlertsJob {
  private readonly logger = new Logger(SchedulerAlertsJob.name);

  // Static map of expected intervals for known jobs
  // jobName -> expected interval in ms
  private readonly EXPECTED_INTERVALS: Record<string, number> = {
    'every-minute': 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    'daily-cleanup': 24 * 60 * 60 * 1000,
    'gdpr-integrity-check': 24 * 60 * 60 * 1000,
  };

  /**
   * Alert debouncing and threshold constants.
   */
  private readonly STUCK_LOCK_THRESHOLD_MINUTES = 120; // 2 hours
  private readonly ORPHANED_LOCK_THRESHOLD_MINUTES = 120; // 2 hours
  private readonly ALERT_DEBOUNCE_MINUTES = 30; // 30 minutes
  private readonly ERROR_WINDOW_MINUTES = 10;
  private readonly ERROR_THRESHOLD_COUNT = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertDeliveryService: AlertDeliveryService,
  ) {}

  /**
   * Main entry point.
   * Runs all checks and sends alerts if needed.
   * Never throws (fail-safe).
   */
  async run(): Promise<void> {
    try {
      await this.checkMissedSchedules();
      await this.checkLockAnomalies();
      await this.checkRepeatedErrors();
    } catch (error) {
      // Fail-safe: Log but do not crash the scheduler
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to run scheduler alerts: ${errorMessage}`);
    }
  }

  /**
   * 1. Job Not Running
   * Alert if lastRunAt > expected + buffer
   */
  private async checkMissedSchedules(): Promise<void> {
    const locks = await this.prisma.schedulerLock.findMany();
    const now = new Date();

    for (const lock of locks) {
      const expectedInterval = this.EXPECTED_INTERVALS[lock.jobName];
      // Only check known jobs with defined intervals
      if (!expectedInterval) continue;

      // If job has never run, we rely on manual verification or other signals for now.
      // Ignoring lastRunAt: null prevents false positives when new jobs are deployed
      // but haven't executed yet.
      if (!lock.lastRunAt) continue;

      const lastRun = new Date(lock.lastRunAt);

      // Allow a generous buffer: expected interval + MAX(5 mins, 50% of interval)
      const buffer = Math.max(5 * 60 * 1000, expectedInterval * 0.5);
      const threshold = expectedInterval + buffer;
      const diff = now.getTime() - lastRun.getTime();

      if (diff > threshold) {
        await this.sendAlert(
          'CRITICAL',
          `Job Not Running: ${lock.jobName}`,
          `
            <h3>Job Execution Delayed</h3>
            <p><strong>Impact:</strong> Critical background tasks are not running. System consistency may be at risk.</p>
            <ul>
                <li><strong>Job:</strong> ${lock.jobName}</li>
                <li><strong>Last Run:</strong> ${lastRun.toISOString()}</li>
                <li><strong>Current Delay:</strong> ${Math.floor(diff / 1000 / 60)} minutes</li>
                <li><strong>Expected Interval:</strong> ${Math.floor(expectedInterval / 1000 / 60)} minutes</li>
            </ul>
            <p><strong>Action Required:</strong> Check scheduler logs and worker health.</p>
            <p><small>This alert is rate-limited to once every ${this.ALERT_DEBOUNCE_MINUTES} minutes.</small></p>
          `,
        );
      }
    }
  }

  /**
   * 2. Lock Anomalies
   * Detects:
   * - Stuck Running Locks: Held for > 2h (potentially stuck job)
   * - Orphaned Locks: Released/Expired > 2h ago but not cleaned up (scheduler cleanup failing)
   *
   * Note: In this system, "expiresAt < now" is the normal state for idle, completed jobs
   * before the cleanup process runs. We only alert if they are *significantly* old.
   */
  private async checkLockAnomalies(): Promise<void> {
    const now = new Date();

    // Thresholds for anomaly detection
    const stuckThreshold = new Date(now.getTime() - this.STUCK_LOCK_THRESHOLD_MINUTES * 60 * 1000);
    const orphanedThreshold = new Date(
      now.getTime() - this.ORPHANED_LOCK_THRESHOLD_MINUTES * 60 * 1000,
    );

    const locks = await this.prisma.schedulerLock.findMany();

    for (const lock of locks) {
      // Case A: Stuck Running Job
      // Lock is active (expiresAt > now) BUT has been held for too long (lockedAt < threshold).
      // This implies the job is running but taking an excessive amount of time (or heartbeat failed).
      if (lock.expiresAt > now && lock.lockedAt < stuckThreshold) {
        await this.sendAlert(
          'WARNING',
          `Stuck Running Job: ${lock.jobName}`,
          `
              <h3>Stuck Running Job Detected</h3>
              <p><strong>Impact:</strong> The job has been running for over ${this.STUCK_LOCK_THRESHOLD_MINUTES} minutes. It may be stuck or processing an unusually large batch.</p>
              <ul>
                  <li><strong>Job:</strong> ${lock.jobName}</li>
                  <li><strong>Locked At:</strong> ${lock.lockedAt.toISOString()}</li>
                  <li><strong>Locked By:</strong> ${lock.lockedBy}</li>
                  <li><strong>Expires At:</strong> ${lock.expiresAt.toISOString()}</li>
              </ul>
              <p><strong>Action Required:</strong> Check worker logs. If stuck, the lock may need manual clearing.</p>
          `,
        );
        continue; // Only report one anomaly type per job per run
      }

      // Case B: Orphaned Scheduler Lock
      // Lock is expired (expiresAt < now) AND expired a long time ago (expiresAt < threshold).
      // Standard cleanup should have removed this row. Its presence suggests cleanup failure.
      if (lock.expiresAt < orphanedThreshold) {
        await this.sendAlert(
          'INFO',
          `Orphaned Scheduler Lock: ${lock.jobName}`,
          `
              <h3>Orphaned Lock Detected</h3>
              <p><strong>Impact:</strong> Identify potential failure in the stale lock cleanup process. This lock entry should have been deleted.</p>
              <ul>
                  <li><strong>Job:</strong> ${lock.jobName}</li>
                  <li><strong>Expires At:</strong> ${lock.expiresAt.toISOString()}</li>
              </ul>
              <p><strong>Action Required:</strong> Verify 'daily-cleanup' job execution.</p>
          `,
        );
      }
    }
  }

  /**
   * 3. Repeated Job Errors
   * Alert if multiple ERROR logs from same source in last N minutes
   */
  private async checkRepeatedErrors(): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.ERROR_WINDOW_MINUTES * 60 * 1000);

    // Group by source using Prisma groupBy
    const errorGroups = await this.prisma.internalLog.groupBy({
      by: ['source'],
      where: {
        level: 'ERROR',
        createdAt: { gte: windowStart },
      },
      _count: {
        id: true,
      },
      _min: {
        createdAt: true,
      },
      _max: {
        createdAt: true,
      },
      having: {
        id: {
          _count: { gt: this.ERROR_THRESHOLD_COUNT },
        },
      },
    });

    for (const group of errorGroups) {
      await this.sendAlert(
        'WARNING',
        `High Error Rate: ${group.source}`,
        `
            <h3>Repeated Job Errors</h3>
            <p><strong>Impact:</strong> The ${group.source} component is experiencing instability.</p>
            <ul>
                <li><strong>Source:</strong> ${group.source}</li>
                <li><strong>Error Count:</strong> ${group._count.id} in last ${this.ERROR_WINDOW_MINUTES} minutes</li>
                <li><strong>First Error:</strong> ${group._min.createdAt?.toISOString() ?? 'N/A'}</li>
                <li><strong>Last Error:</strong> ${group._max.createdAt?.toISOString() ?? 'N/A'}</li>
            </ul>
             <p><strong>Action Required:</strong> Check internal logs for details.</p>
        `,
      );
    }
  }

  /**
   * Send alert via AlertDeliveryService with rate-limiting.
   * Rate-limiting stays in this job layer (not in delivery service).
   */
  private async sendAlert(
    severity: 'CRITICAL' | 'WARNING' | 'INFO',
    title: string,
    htmlBody: string,
  ): Promise<void> {
    try {
      // 1. Rate Limiting Check
      // Use InternalLog as soft state to prevent alert floods.
      const now = new Date();
      const debounceStart = new Date(now.getTime() - this.ALERT_DEBOUNCE_MINUTES * 60 * 1000);

      const fullSubject = `[INFRA][SCHEDULER][${severity}] ${title}`;

      const recentAlert = await this.prisma.internalLog.findFirst({
        where: {
          source: 'SchedulerAlertsJob',
          level: 'WARN', // We log alerts as WARN
          message: 'Scheduler Alert Sent',
          context: {
            path: ['subject'],
            equals: fullSubject,
          },
          createdAt: { gte: debounceStart },
        },
      });

      if (recentAlert) {
        this.logger.debug(
          `Skipping alert "${title}" - rate limited (last sent: ${recentAlert.createdAt.toISOString()})`,
        );
        return;
      }

      // 2. Send via AlertDeliveryService
      const result = await this.alertDeliveryService.sendAlert({
        recipientGroup: RecipientGroup.INFRA_ALERTS,
        severity,
        title: `[INFRA][SCHEDULER] ${title}`,
        htmlBody,
      });

      if (result.sent) {
        // 3. Log Success (Used for Rate Limiting)
        await this.prisma.internalLog.create({
          data: {
            level: 'WARN', // Using WARN to ensure it's noticed and retained
            source: 'SchedulerAlertsJob',
            message: 'Scheduler Alert Sent',
            context: { subject: fullSubject },
          },
        });
      }
    } catch (error) {
      // Log failure to send alert
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to send alert: ${errorMessage}`);

      // Log to InternalLog for audit trail
      try {
        await this.prisma.internalLog.create({
          data: {
            level: 'ERROR',
            source: 'SchedulerAlertsJob',
            message: 'Failed to send alert',
            context: { error: errorMessage, title },
          },
        });
      } catch (logError) {
        // Double fault - just log to console
        this.logger.error('Failed to log alert failure to InternalLog');
      }
    }
  }
}
