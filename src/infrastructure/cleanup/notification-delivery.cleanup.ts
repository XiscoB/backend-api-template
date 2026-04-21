import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CleanupJob, CleanupResult } from './cleanup.types';

/**
 * Notification Delivery Cleanup Service
 *
 * Deletes old notification delivery log records to prevent unbounded growth.
 *
 * What it cleans:
 * - NotificationDeliveryLog records older than retention period
 *
 * Safety guarantees:
 * - Only deletes by time (createdAt < cutoff)
 * - Never affects active notifications or user-visible data
 * - Idempotent (safe to run multiple times)
 * - Environment-gated (can be disabled)
 *
 * What it does NOT clean:
 * - NotificationLog (user-visible notifications)
 * - ScheduledNotification (future notifications)
 *
 * Environment variables:
 * - NOTIFICATION_DELIVERY_CLEANUP_ENABLED (default: false)
 * - NOTIFICATION_DELIVERY_RETENTION_DAYS (default: 90)
 *
 * Note: Delivery logs are audit/observability data only.
 * Deleting them does not affect user experience or notification delivery.
 */
@Injectable()
export class NotificationDeliveryCleanupService implements CleanupJob {
  readonly name = 'notification-delivery-cleanup';
  private readonly logger = new Logger(NotificationDeliveryCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async run(): Promise<CleanupResult> {
    const startTime = Date.now();

    // Read configuration
    const enabled = this.config.get<boolean>('NOTIFICATION_DELIVERY_CLEANUP_ENABLED', false);
    const retentionDays = this.config.get<number>('NOTIFICATION_DELIVERY_RETENTION_DAYS', 90);

    if (!enabled) {
      this.logger.debug(
        'Notification delivery cleanup is disabled (NOTIFICATION_DELIVERY_CLEANUP_ENABLED=false)',
      );
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
      `Starting notification delivery cleanup (retention: ${retentionDays} days, cutoff: ${cutoffDate.toISOString()})`,
    );

    try {
      // Delete old NotificationDeliveryLog records
      const result = await this.prisma.notificationDeliveryLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
        },
      });

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `Deleted ${result.count} notification delivery log record(s) older than ${retentionDays} days (${durationMs}ms)`,
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
      this.logger.error('Failed to clean notification delivery records:', error);

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
