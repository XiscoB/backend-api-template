import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';

// ... (lines 4-150 unchanged)

/**
 * Payload contract for WEEKLY_GROWTH_REPORT notification.
 * Must be kept in sync with AdminEmailHook handling.
 */
export interface WeeklyGrowthPayload {
  periodStart: string; // ISO
  periodEnd: string; // ISO
  metrics: {
    newUsers: number;
    activeUsers: {
      wau: number;
      mau: number;
      wauMauRatio: number;
    };
    dormancy: {
      d30: number; // Inactive >= 30 days
      d60: number;
      d90: number;
    };
    totalIdentities: number;
  };
  generatedAt: string;
}

@Injectable()
export class WeeklyGrowthReportJob {
  private readonly logger = new Logger(WeeklyGrowthReportJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly identityService: IdentityService,
  ) {}

  /**
   * Run the Weekly Growth Report job.
   *
   * 1. Aggregates growth and activity metrics from Identity table.
   * 2. Emits a SYSTEM notification with structured payload.
   * 3. Delivery is handled by AdminEmailHook.
   */
  async run(): Promise<void> {
    this.logger.log('Starting Weekly Growth Report Job');

    // 1. Calculate Time Ranges
    // Report is typically run on Monday morning for the previous week (Mon-Sun)
    // We strictly define "Last Week" as last complete ISO week or just strictly last 7 days?
    // User Def: "New Users: Identity.createdAt within the week"
    // User Def: "WAU: lastActivity >= now() - 7 days"
    // User Def: "MAU: lastActivity >= now() - 30 days"

    const now = new Date();

    // For "New Users", we usually want a fixed window (e.g. last 7 days from execution time)
    // or specifically the previous calendar week?
    // User said "reporting week". Let's stick to "Last 7 days" relative to execution time for simplicity and consistency with WAU definition.
    // If the cron runs at Monday 9am, these metrics cover Mon 9am -> Mon 9am.

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // 2. Query Metrics (Parallelize for efficiency)
    const [newUsers, totalIdentities, wau, mau, dormant30, dormant60, dormant90] =
      await Promise.all([
        // New Users (Created in last 7 days)
        this.prisma.identity.count({
          where: { createdAt: { gte: sevenDaysAgo } },
        }),
        // Total Identities
        this.prisma.identity.count(),
        // WAU (Active in last 7 days, NOT anonymized)
        this.prisma.identity.count({
          where: {
            lastActivity: { gte: sevenDaysAgo },
            anonymized: false,
          },
        }),
        // MAU (Active in last 30 days, NOT anonymized)
        this.prisma.identity.count({
          where: {
            lastActivity: { gte: thirtyDaysAgo },
            anonymized: false,
          },
        }),
        // Dormancy 30+ (Inactive >= 30 days OR null, NOT anonymized)
        this.prisma.identity.count({
          where: {
            OR: [{ lastActivity: { lt: thirtyDaysAgo } }, { lastActivity: null }],
            anonymized: false,
          },
        }),
        // Dormancy 60+
        this.prisma.identity.count({
          where: {
            OR: [{ lastActivity: { lt: sixtyDaysAgo } }, { lastActivity: null }],
            anonymized: false,
          },
        }),
        // Dormancy 90+
        this.prisma.identity.count({
          where: {
            OR: [{ lastActivity: { lt: ninetyDaysAgo } }, { lastActivity: null }],
            anonymized: false,
          },
        }),
      ]);

    // 3. Derived Metrics
    // Avoid division by zero
    const wauMauRatio = mau > 0 ? (wau / mau) * 100 : 0;

    // 4. Construct Payload
    const payload: WeeklyGrowthPayload = {
      periodStart: sevenDaysAgo.toISOString(),
      periodEnd: now.toISOString(),
      metrics: {
        newUsers,
        totalIdentities,
        activeUsers: {
          wau,
          mau,
          wauMauRatio: Number(wauMauRatio.toFixed(1)), // Sensible precision
        },
        dormancy: {
          d30: dormant30,
          d60: dormant60,
          d90: dormant90,
        },
      },
      generatedAt: now.toISOString(),
    };

    // 5. Emit Notification
    // Use SYSTEM identity as actor and target (AdminEmailHook intercepts it)
    const systemIdentity = await this.identityService.getOrCreateSystemIdentity();

    await this.notificationsService.notifyByIdentityId({
      identityId: systemIdentity.id,
      actorIdentityId: systemIdentity.id,
      type: 'WEEKLY_GROWTH_REPORT',
      payload: { ...payload } as Record<string, unknown>,
    });

    this.logger.log('Weekly Growth Report generated and notification emitted.');
  }
}
