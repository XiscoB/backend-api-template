import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CleanupJob, CleanupResult } from './cleanup.types';

/**
 * Push Token Cleanup Service
 *
 * Deletes inactive push tokens to prevent unbounded growth.
 *
 * What it cleans:
 * - UserPushChannel records where isActive = false
 * - Only if updatedAt is older than retention period
 *
 * Safety guarantees:
 * - NEVER deletes active tokens (isActive = true)
 * - Only deletes inactive tokens that are old
 * - Idempotent (safe to run multiple times)
 * - Environment-gated (can be disabled)
 *
 * What it does NOT clean:
 * - Active push tokens (isActive = true)
 * - Recently deactivated tokens (within retention window)
 *
 * Environment variables:
 * - PUSH_TOKEN_CLEANUP_ENABLED (default: false)
 * - PUSH_TOKEN_RETENTION_DAYS (default: 30)
 *
 * Note: Push tokens become inactive when Expo rejects them
 * (e.g., app uninstalled, token expired). This cleanup removes
 * old inactive tokens to free space.
 */
@Injectable()
export class PushTokenCleanupService implements CleanupJob {
  readonly name = 'push-token-cleanup';
  private readonly logger = new Logger(PushTokenCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async run(): Promise<CleanupResult> {
    const startTime = Date.now();

    // Read configuration
    const enabled = this.config.get<boolean>('PUSH_TOKEN_CLEANUP_ENABLED', false);
    const retentionDays = this.config.get<number>('PUSH_TOKEN_RETENTION_DAYS', 30);

    if (!enabled) {
      this.logger.debug('Push token cleanup is disabled (PUSH_TOKEN_CLEANUP_ENABLED=false)');
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
      `Starting push token cleanup (retention: ${retentionDays} days, cutoff: ${cutoffDate.toISOString()})`,
    );

    try {
      // Delete old inactive push tokens
      // Only isActive = false - NEVER delete active tokens
      const result = await this.prisma.userPushChannel.deleteMany({
        where: {
          isActive: false,
          updatedAt: {
            lt: cutoffDate,
          },
        },
      });

      const durationMs = Date.now() - startTime;

      this.logger.log(
        `Deleted ${result.count} inactive push token(s) older than ${retentionDays} days (${durationMs}ms)`,
      );

      return {
        recordsDeleted: result.count,
        durationMs,
        metadata: {
          retentionDays,
          cutoffDate: cutoffDate.toISOString(),
          onlyInactive: true,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error('Failed to clean push tokens:', error);

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
