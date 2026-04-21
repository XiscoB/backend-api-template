import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InternalLogService } from '../gdpr/internal-log.service';
import { InternalLogLevel } from '@prisma/client';

@Injectable()
export class ReportsCronService {
  private readonly logger = new Logger(ReportsCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly internalLogService: InternalLogService,
  ) {}

  /**
   * Periodically checks for unresolved reports and emits a digest summary.
   *
   * @remarks
   * - Read-only: Does NOT mutate reports.
   * - Batching is intentionally deferred; current digest uses aggregated data only.
   */
  async processReportDigest(): Promise<void> {
    this.logger.log('Starting Report Digest check...');

    // Count pending reports (resolved=false OR valid=null)
    // Note: 'valid=null' check is logically redundant if we only care about 'resolved=false',
    // but included for completeness of "pending" definition.
    // However, existing schema implies resolved=false is the primary "pending" state.
    // We will query for resolved: false.
    const pendingReports = await this.prisma.report.findMany({
      where: {
        resolved: false,
      },
      select: {
        id: true,
        contentType: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (pendingReports.length === 0) {
      this.logger.debug('No pending reports found.');
      return;
    }

    // Build Summary
    const totalCount = pendingReports.length;
    const oldestReportAt = pendingReports[0].createdAt;

    const byContentType: Record<string, number> = {};
    for (const report of pendingReports) {
      byContentType[report.contentType] = (byContentType[report.contentType] ?? 0) + 1;
    }

    const message = `Report Digest: ${totalCount} pending reports`;
    const metadata = {
      pendingCount: totalCount,
      oldestReportAt,
      byContentType,
    };

    this.logger.log(message, metadata);

    // Emit Audit Log / Notification
    await this.internalLogService.log({
      level: InternalLogLevel.INFO,
      source: 'ReportsCronService',
      message,
      context: metadata,
    });
  }
}
