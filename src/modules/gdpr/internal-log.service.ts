import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { INTERNAL_LOGS } from '../../config/app.constants';
import { InternalLogLevel, Prisma } from '@prisma/client';

/**
 * Internal Log Service
 *
 * Manages internal operational logs with automatic cleanup.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS IS NOT:
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Analytics or metrics (use external observability tools)
 * - User activity tracking (privacy violation)
 * - Audit logs (use GdprAuditLog instead)
 * - Business event logs (wrong system)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * PURPOSE:
 * ═══════════════════════════════════════════════════════════════════════════════
 * - Internal operational diagnostics only
 * - Time-bounded retention (auto-deleted)
 * - Platform stability monitoring
 *
 * Legal basis: Legitimate interest (platform stability)
 * GDPR: NOT included in data exports (not personal data by default)
 *
 * @see docs/INTERNAL_OPERATIONAL_LOGS.md
 */
@Injectable()
export class InternalLogService {
  private readonly logger = new Logger(InternalLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write an internal operational log.
   *
   * @param entry - Log entry details
   */
  async log(entry: {
    level: InternalLogLevel;
    source: string;
    message: string;
    context?: Record<string, unknown>;
    identityId?: string;
  }): Promise<{ id: string; level: string; source: string; message: string; createdAt: Date }> {
    return await this.prisma.internalLog.create({
      data: {
        level: entry.level,
        source: entry.source,
        message: entry.message,
        context: entry.context ? toPrismaJson(entry.context) : undefined,
        identityId: entry.identityId,
      },
    });
  }

  /**
   * Clean up internal logs older than the configured retention period.
   *
   * This method is:
   * - Idempotent: Safe to run multiple times
   * - Time-bounded: Only deletes logs past retention period
   * - No side effects: Only affects internal_logs table
   *
   * @param retentionDays - Number of days to retain logs (default: from constants)
   * @param limit - Maximum number of logs to delete per run (default: from constants)
   * @returns Number of logs deleted
   */
  async cleanupExpiredLogs(
    retentionDays: number = INTERNAL_LOGS.DEFAULT_RETENTION_DAYS,
    limit: number = INTERNAL_LOGS.CLEANUP_BATCH_SIZE,
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    this.logger.debug(
      `Cleaning up internal logs older than ${cutoffDate.toISOString()} (retention: ${retentionDays} days)`,
    );

    // Find IDs to delete (batch approach for large datasets)
    const logsToDelete = await this.prisma.internalLog.findMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
      select: { id: true },
      take: limit,
    });

    if (logsToDelete.length === 0) {
      return 0;
    }

    const ids = logsToDelete.map((log: { id: string }) => log.id);

    // Delete in batch
    const result = await this.prisma.internalLog.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    return result.count;
  }
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return JSON.parse(JSON.stringify(value));
}
