import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CleanupJob, CleanupResult } from './cleanup.types';

/**
 * Audit Log Cleanup Service
 *
 * Deletes old audit log records to prevent unbounded growth.
 *
 * What it cleans:
 * - GdprAuditLog records older than retention period
 *
 * Safety guarantees:
 * - Only deletes by time (createdAt < cutoff)
 * - Never affects active requests or business logic
 * - Idempotent (safe to run multiple times)
 * - Environment-gated (can be disabled)
 *
 * Environment variables:
 * - AUDIT_LOG_CLEANUP_ENABLED (default: false)
 * - AUDIT_LOG_RETENTION_DAYS (default: 90)
 *
 * Note: This is pure hygiene. Legal retention requirements must be
 * handled separately (e.g., archival to cold storage before deletion).
 */
@Injectable()
export class AuditLogCleanupService implements CleanupJob {
  readonly name = 'audit-log-cleanup';
  private readonly logger = new Logger(AuditLogCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async run(): Promise<CleanupResult> {
    const startTime = Date.now();

    // Read configuration
    const enabled = this.config.get<boolean>('AUDIT_LOG_CLEANUP_ENABLED', false);
    const retentionDays = this.config.get<number>('AUDIT_LOG_RETENTION_DAYS', 90);

    if (!enabled) {
      this.logger.debug('Audit log cleanup is disabled (AUDIT_LOG_CLEANUP_ENABLED=false)');
      return {
        recordsDeleted: 0,
        durationMs: Date.now() - startTime,
        metadata: { enabled: false },
      };
    }

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    this.logger.log(
      `Starting audit log cleanup (retention: ${retentionDays} days, cutoff: ${cutoffDate.toISOString()})`,
    );

    try {
      // Delete old audit logs
      const result = await this.prisma.gdprAuditLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `Deleted ${result.count} audit log record(s) older than ${retentionDays} days (${durationMs}ms)`,
      );

      return {
        recordsDeleted: result.count,
        durationMs,
        metadata: {
          retentionDays,
          cutoffDate: cutoffDate.toISOString(),
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error('Failed to clean audit logs:', error);

      return {
        recordsDeleted: 0,
        durationMs,
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          retentionDays,
          cutoffDate: cutoffDate.toISOString(),
        },
      };
    }
  }
}
