import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';
import { RequestStatus, RequestType, GdprAuditAction } from '@prisma/client';

export interface GdprComplianceReportPayload {
  periodStart: string;
  periodEnd: string;
  overview: {
    created: Record<string, number>;
    completed: number;
    failed: number;
    expired: number;
    pending: number;
  };
  performance: {
    avgProcessingTimeMs: number;
    maxProcessingTimeMs: number;
    oldestPendingRequestAgeHours: number;
    stuckRequestCount: number;
  };
  integrity: {
    missingAuditLogs: number;
    missingExportFiles: number;
    undeletedExpiredFiles: number;
  };
  legalHolds: {
    activeCount: number;
    expiringSoonCount: number;
  };
  generatedAt: string;
}

@Injectable()
export class GdprComplianceReportJob {
  private readonly logger = new Logger(GdprComplianceReportJob.name);
  private readonly STUCK_THRESHOLD_HOURS = 24;
  private readonly HOLD_EXPIRY_WARNING_DAYS = 14;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly identityService: IdentityService,
  ) {}

  async run(): Promise<void> {
    this.logger.log('Starting Weekly GDPR Compliance Report Job');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Overview Metrics (Last 7 Days for throughput, Current state for pending)
    const [createdExport, createdDelete, createdSuspend, completed, failed, expired, pendingTotal] =
      await Promise.all([
        this.prisma.request.count({
          where: { requestedAt: { gte: sevenDaysAgo }, requestType: RequestType.GDPR_EXPORT },
        }),
        this.prisma.request.count({
          where: { requestedAt: { gte: sevenDaysAgo }, requestType: RequestType.GDPR_DELETE },
        }),
        this.prisma.request.count({
          where: { requestedAt: { gte: sevenDaysAgo }, requestType: RequestType.GDPR_SUSPEND },
        }),
        this.prisma.request.count({
          where: { processedAt: { gte: sevenDaysAgo }, status: RequestStatus.COMPLETED },
        }),
        this.prisma.request.count({
          where: { processedAt: { gte: sevenDaysAgo }, status: RequestStatus.FAILED },
        }),
        this.prisma.request.count({
          where: { expiresAt: { gte: sevenDaysAgo, lte: now }, status: RequestStatus.EXPIRED },
        }),
        this.prisma.request.count({
          where: { status: { in: [RequestStatus.PENDING, RequestStatus.PROCESSING] } },
        }),
      ]);

    // 2. Processing Performance
    const completedRequests = await this.prisma.request.findMany({
      where: {
        status: RequestStatus.COMPLETED,
        processedAt: { gte: sevenDaysAgo },
      },
      select: { requestedAt: true, processedAt: true },
    });

    let totalTimeMs = 0;
    let maxTimeMs = 0;
    for (const req of completedRequests) {
      if (req.processedAt && req.requestedAt) {
        const time = req.processedAt.getTime() - req.requestedAt.getTime();
        totalTimeMs += time;
        if (time > maxTimeMs) maxTimeMs = time;
      }
    }
    const avgTimeMs = completedRequests.length > 0 ? totalTimeMs / completedRequests.length : 0;

    // Oldest Pending
    const oldestPending = await this.prisma.request.findFirst({
      where: { status: { in: [RequestStatus.PENDING, RequestStatus.PROCESSING] } },
      orderBy: { requestedAt: 'asc' },
      select: { requestedAt: true },
    });

    const oldestPendingAgeHours = oldestPending
      ? (now.getTime() - oldestPending.requestedAt.getTime()) / (1000 * 60 * 60)
      : 0;

    // Stuck Requests
    const stuckThresholdTime = new Date(
      now.getTime() - this.STUCK_THRESHOLD_HOURS * 60 * 60 * 1000,
    );
    const stuckRequestCount = await this.prisma.request.count({
      where: {
        status: { in: [RequestStatus.PENDING, RequestStatus.PROCESSING] },
        requestedAt: { lt: stuckThresholdTime },
      },
    });

    // 3. Integrity Checks
    const recentCompleted = await this.prisma.request.findMany({
      where: {
        status: RequestStatus.COMPLETED,
        processedAt: { gte: sevenDaysAgo },
        requestType: RequestType.GDPR_EXPORT,
      },
      select: { id: true, identityId: true },
      take: 100, // Limit sample size
    });

    let missingAuditLogs = 0;
    for (const req of recentCompleted) {
      const validLog = await this.prisma.gdprAuditLog.findFirst({
        where: {
          identityId: req.identityId,
          action: GdprAuditAction.EXPORT_COMPLETED,
          performedAt: { gte: sevenDaysAgo },
        },
      });

      if (!validLog) {
        missingAuditLogs++;
      }
    }

    // "Files where expiresAt < now() and deletedAt IS NULL"
    const undeletedExpiredFiles = await this.prisma.gdprExportFile.count({
      where: {
        expiresAt: { lt: now },
        deletedAt: null,
      },
    });

    // 4. Deletion Legal Holds
    const activeHolds = await this.prisma.deletionLegalHold.count({
      where: { expiresAt: { gt: now } },
    });

    const warningDate = new Date(
      now.getTime() + this.HOLD_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000,
    );
    const expiringSoon = await this.prisma.deletionLegalHold.count({
      where: {
        expiresAt: { gt: now, lt: warningDate },
      },
    });

    // 5. Construct Payload
    const payload: GdprComplianceReportPayload = {
      periodStart: sevenDaysAgo.toISOString(),
      periodEnd: now.toISOString(),
      overview: {
        created: {
          EXPORT: createdExport,
          DELETE: createdDelete,
          SUSPEND: createdSuspend,
        },
        completed,
        failed,
        expired,
        pending: pendingTotal,
      },
      performance: {
        avgProcessingTimeMs: Math.round(avgTimeMs),
        maxProcessingTimeMs: maxTimeMs,
        oldestPendingRequestAgeHours: Number(oldestPendingAgeHours.toFixed(1)),
        stuckRequestCount,
      },
      integrity: {
        missingAuditLogs: missingAuditLogs,
        missingExportFiles: 0,
        undeletedExpiredFiles,
      },
      legalHolds: {
        activeCount: activeHolds,
        expiringSoonCount: expiringSoon,
      },
      generatedAt: now.toISOString(),
    };

    // 6. Send System Notification
    const systemIdentity = await this.identityService.getOrCreateSystemIdentity();

    await this.notificationsService.notifyByIdentityId({
      identityId: systemIdentity.id,
      actorIdentityId: systemIdentity.id,
      type: 'GDPR_COMPLIANCE_REPORT',
      payload: { ...payload } as Record<string, unknown>,
    });

    this.logger.log('Weekly GDPR Compliance Report generated and sent.');
  }
}
