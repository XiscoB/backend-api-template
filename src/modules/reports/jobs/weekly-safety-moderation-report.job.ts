import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';

/**
 * Payload contract for WEEKLY_SAFETY_MODERATION_REPORT notification.
 * Must be kept in sync with AdminEmailHook handling.
 */
export interface WeeklySafetyModerationPayload {
  periodStart: string; // ISO
  periodEnd: string; // ISO

  /**
   * 1. Report Volume
   * Total reports filed, with breakdown by contentType and category.
   */
  reportVolume: {
    total: number;
    previousWeekTotal: number;
    trend: 'UP' | 'DOWN' | 'FLAT';
    byContentType: Array<{ contentType: string; count: number }>;
    byCategory: Array<{ category: string; count: number }>;
  };

  /**
   * 2. Moderation Throughput
   * Reports resolved and resolution rate.
   */
  throughput: {
    resolvedThisWeek: number;
    resolutionRate: number; // percentage (resolved / created)
    avgResolutionTimeHours: number | null; // null if no resolved reports
  };

  /**
   * 3. Moderation Backlog
   *
   * DEFINITION: Backlog includes reports where resolved = false regardless of age.
   * Soft-deleted reports (deletedAt != null) are excluded.
   */
  backlog: {
    total: number;
    olderThan7Days: number;
    olderThan14Days: number;
    olderThan30Days: number;
  };

  /**
   * 4. Resolution Outcomes
   * Valid = actionable, Invalid = dismissed, Pending = awaiting review.
   */
  outcomes: {
    valid: number; // valid = true
    invalid: number; // valid = false
    pending: number; // valid = null (still under review)
  };

  /**
   * 5. Safety-Related Identity Signals (Aggregate Only)
   *
   * NOTE: Counts reflect current identity state, not newly flagged this week.
   * These are point-in-time snapshots of flagged/suspended/banned identities.
   */
  identitySignals: {
    flagged: number;
    suspended: number;
    banned: number;
    totalFlaggedSuspendedBanned: number;
    previousWeekTotal: number;
    trend: 'UP' | 'DOWN' | 'FLAT';
  };

  generatedAt: string;
}

@Injectable()
export class WeeklySafetyModerationReportJob {
  private readonly logger = new Logger(WeeklySafetyModerationReportJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * Run the Weekly Safety & Moderation Report job.
   *
   * 1. Aggregates report volume from Report.
   * 2. Calculates moderation throughput from Report.
   * 3. Calculates moderation backlog from Report.
   * 4. Aggregates resolution outcomes from Report.
   * 5. Aggregates identity signals from Identity.
   * 6. Emits a SYSTEM notification with structured payload.
   * 7. Delivery is handled by AdminEmailHook.
   */
  async run(): Promise<void> {
    this.logger.log('Starting Weekly Safety & Moderation Report Job');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ─────────────────────────────────────────────────────────────
    // 1. Report Volume (from Report, past 7 days)
    // ─────────────────────────────────────────────────────────────

    const [currentWeekReports, previousWeekReports, reportsByContentType, reportsByCategory] =
      await Promise.all([
        // Current week total
        this.prisma.report.count({
          where: {
            createdAt: { gte: sevenDaysAgo },
            deletedAt: null,
          },
        }),
        // Previous week total
        this.prisma.report.count({
          where: {
            createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
            deletedAt: null,
          },
        }),
        // Breakdown by contentType (current week)
        this.prisma.report.groupBy({
          by: ['contentType'],
          where: {
            createdAt: { gte: sevenDaysAgo },
            deletedAt: null,
          },
          _count: { contentType: true },
          orderBy: { _count: { contentType: 'desc' } },
          take: 10,
        }),
        // Breakdown by category (current week)
        this.prisma.report.groupBy({
          by: ['category'],
          where: {
            createdAt: { gte: sevenDaysAgo },
            deletedAt: null,
          },
          _count: { category: true },
          orderBy: { _count: { category: 'desc' } },
          take: 10,
        }),
      ]);

    const volumeTrend = this.calculateTrend(currentWeekReports, previousWeekReports);

    // ─────────────────────────────────────────────────────────────
    // 2. Moderation Throughput (from Report)
    // ─────────────────────────────────────────────────────────────

    // Reports resolved this week
    const resolvedThisWeek = await this.prisma.report.count({
      where: {
        resolvedAt: { gte: sevenDaysAgo },
        resolved: true,
        deletedAt: null,
      },
    });

    // Calculate resolution rate (resolved this week / created this week)
    const resolutionRate =
      currentWeekReports > 0 ? (resolvedThisWeek / currentWeekReports) * 100 : 0;

    // Average time to resolution for reports resolved this week
    const resolvedReports = await this.prisma.report.findMany({
      where: {
        resolvedAt: { gte: sevenDaysAgo },
        resolved: true,
        deletedAt: null,
      },
      select: {
        createdAt: true,
        resolvedAt: true,
      },
    });

    let avgResolutionTimeHours: number | null = null;
    if (resolvedReports.length > 0) {
      const totalMs = resolvedReports.reduce((sum, r) => {
        if (r.resolvedAt) {
          return sum + (r.resolvedAt.getTime() - r.createdAt.getTime());
        }
        return sum;
      }, 0);
      avgResolutionTimeHours = totalMs / resolvedReports.length / 1000 / 60 / 60;
    }

    // ─────────────────────────────────────────────────────────────
    // 3. Moderation Backlog (from Report)
    //
    // DEFINITION: Backlog includes reports where resolved = false
    // regardless of age. Soft-deleted reports are excluded.
    // ─────────────────────────────────────────────────────────────

    const [backlogTotal, backlogOlder7, backlogOlder14, backlogOlder30] = await Promise.all([
      // Total unresolved
      this.prisma.report.count({
        where: {
          resolved: false,
          deletedAt: null,
        },
      }),
      // Unresolved > 7 days old
      this.prisma.report.count({
        where: {
          resolved: false,
          deletedAt: null,
          createdAt: { lt: sevenDaysAgo },
        },
      }),
      // Unresolved > 14 days old
      this.prisma.report.count({
        where: {
          resolved: false,
          deletedAt: null,
          createdAt: { lt: fourteenDaysAgo },
        },
      }),
      // Unresolved > 30 days old
      this.prisma.report.count({
        where: {
          resolved: false,
          deletedAt: null,
          createdAt: { lt: thirtyDaysAgo },
        },
      }),
    ]);

    // ─────────────────────────────────────────────────────────────
    // 4. Resolution Outcomes (from Report)
    // ─────────────────────────────────────────────────────────────

    const outcomeStats = await this.prisma.report.groupBy({
      by: ['valid'],
      where: {
        resolvedAt: { gte: sevenDaysAgo },
        deletedAt: null,
      },
      _count: { valid: true },
    });

    const validCount = this.getOutcomeCount(outcomeStats, true);
    const invalidCount = this.getOutcomeCount(outcomeStats, false);
    const pendingCount = this.getOutcomeCount(outcomeStats, null);

    // ─────────────────────────────────────────────────────────────
    // 5. Safety-Related Identity Signals (from Identity)
    //
    // NOTE: Counts reflect current identity state, not newly flagged
    // this week. These are point-in-time snapshots.
    // ─────────────────────────────────────────────────────────────

    const [flaggedCount, suspendedCount, bannedCount] = await Promise.all([
      this.prisma.identity.count({
        where: { isFlagged: true, anonymized: false },
      }),
      this.prisma.identity.count({
        where: { isSuspended: true, anonymized: false },
      }),
      this.prisma.identity.count({
        where: { isBanned: true, anonymized: false },
      }),
    ]);

    const currentTotal = flaggedCount + suspendedCount + bannedCount;

    // For WoW trend, we need to check historical state
    // Since Identity flags are stateful (not event-based), we use InternalLog
    // as a proxy OR we simply compare to a stored snapshot.
    // For simplicity and to avoid adding new tables, we just report current state
    // and note this in the email footer.
    // Previous week total is set to current for now (trend will be FLAT).
    // TODO: If historical tracking is needed, implement via InternalLog snapshots.
    const previousWeekIdentityTotal = currentTotal;
    const identityTrend = this.calculateTrend(currentTotal, previousWeekIdentityTotal);

    // ─────────────────────────────────────────────────────────────
    // Construct Payload
    // ─────────────────────────────────────────────────────────────

    const payload: WeeklySafetyModerationPayload = {
      periodStart: sevenDaysAgo.toISOString(),
      periodEnd: now.toISOString(),

      reportVolume: {
        total: currentWeekReports,
        previousWeekTotal: previousWeekReports,
        trend: volumeTrend,
        byContentType: reportsByContentType.map((r) => ({
          contentType: r.contentType,
          count: r._count.contentType,
        })),
        byCategory: reportsByCategory.map((r) => ({
          category: r.category,
          count: r._count.category,
        })),
      },

      throughput: {
        resolvedThisWeek,
        resolutionRate: Number(resolutionRate.toFixed(1)),
        avgResolutionTimeHours:
          avgResolutionTimeHours !== null ? Number(avgResolutionTimeHours.toFixed(1)) : null,
      },

      backlog: {
        total: backlogTotal,
        olderThan7Days: backlogOlder7,
        olderThan14Days: backlogOlder14,
        olderThan30Days: backlogOlder30,
      },

      outcomes: {
        valid: validCount,
        invalid: invalidCount,
        pending: pendingCount,
      },

      identitySignals: {
        flagged: flaggedCount,
        suspended: suspendedCount,
        banned: bannedCount,
        totalFlaggedSuspendedBanned: currentTotal,
        previousWeekTotal: previousWeekIdentityTotal,
        trend: identityTrend,
      },

      generatedAt: now.toISOString(),
    };

    // ─────────────────────────────────────────────────────────────
    // Emit Notification
    // ─────────────────────────────────────────────────────────────

    const systemIdentity = await this.identityService.getOrCreateSystemIdentity();

    await this.notificationsService.notifyByIdentityId({
      identityId: systemIdentity.id,
      actorIdentityId: systemIdentity.id,
      type: 'WEEKLY_SAFETY_MODERATION_REPORT',
      payload: { ...payload } as Record<string, unknown>,
    });

    this.logger.log('Weekly Safety & Moderation Report generated and notification emitted.');
  }

  /**
   * Calculate trend direction based on current vs previous values.
   */
  private calculateTrend(current: number, previous: number): 'UP' | 'DOWN' | 'FLAT' {
    const threshold = 0.05; // 5% tolerance for "flat"
    if (previous === 0) {
      return current > 0 ? 'UP' : 'FLAT';
    }
    const changeRatio = (current - previous) / previous;
    if (changeRatio > threshold) return 'UP';
    if (changeRatio < -threshold) return 'DOWN';
    return 'FLAT';
  }

  private getOutcomeCount(
    stats: Array<{ valid: boolean | null; _count: { valid: number } }>,
    value: boolean | null,
  ): number {
    const found = stats.find((s) => s.valid === value);
    return found?._count.valid ?? 0;
  }
}
