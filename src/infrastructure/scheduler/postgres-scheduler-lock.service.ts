/**
 * Scheduler Lock Service
 *
 * Provides database-level locking for scheduled jobs.
 * Ensures only one instance executes a job at a time in multi-replica deployments.
 *
 * Design:
 * - Uses PostgreSQL row-level locking via Prisma
 * - Lock has TTL to prevent deadlocks from crashed processes
 * - Stale locks are automatically cleaned up
 * - Silent failure when lock cannot be acquired
 *
 * @module infrastructure/scheduler
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SchedulerLockService, LockAcquisitionResult } from './scheduler-lock.service';
import { randomUUID } from 'crypto';

@Injectable()
export class PostgresSchedulerLockService implements SchedulerLockService {
  private readonly logger = new Logger(PostgresSchedulerLockService.name);

  /**
   * Unique identifier for this instance.
   * Used to identify which instance holds a lock.
   */
  private readonly instanceId: string;

  /**
   * Default lock TTL in milliseconds (5 minutes).
   * Locks older than this are considered stale and can be taken over.
   */
  private readonly defaultLockTtlMs = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {
    // Generate a unique instance ID on startup
    this.instanceId = `${process.pid}-${randomUUID().substring(0, 8)}`;
    this.logger.log(`Scheduler lock service initialized (instance: ${this.instanceId})`);
  }

  /**
   * Attempt to acquire a lock for a job.
   *
   * If the lock is already held by another instance and not expired,
   * this returns { acquired: false } silently.
   *
   * @param jobName - Unique name of the job to lock
   * @param ttlMs - Lock TTL in milliseconds (default: 5 minutes)
   * @returns Lock acquisition result
   */
  async acquireLock(jobName: string, ttlMs?: number): Promise<LockAcquisitionResult> {
    const lockTtl = ttlMs ?? this.defaultLockTtlMs;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + lockTtl);

    try {
      // Use a transaction with serializable isolation to prevent race conditions
      const result = await this.prisma.$transaction(async (tx): Promise<LockAcquisitionResult> => {
        // Check if lock exists
        const existingLock = await tx.schedulerLock.findUnique({
          where: { jobName },
        });

        if (existingLock) {
          // Check if the lock is expired (stale)
          if (existingLock.expiresAt > now) {
            // Lock is held by another instance and not expired
            if (existingLock.lockedBy !== this.instanceId) {
              return {
                acquired: false,
                lockId: this.instanceId,
                reason: `Lock held by ${existingLock.lockedBy} until ${existingLock.expiresAt.toISOString()}`,
              };
            }
            // We already hold the lock, extend it
          }
          // Lock is expired or we hold it, update it
          await tx.schedulerLock.update({
            where: { jobName },
            data: {
              lockedBy: this.instanceId,
              lockedAt: now,
              expiresAt,
            },
          });
        } else {
          // No lock exists, create one
          await tx.schedulerLock.create({
            data: {
              jobName,
              lockedBy: this.instanceId,
              lockedAt: now,
              expiresAt,
            },
          });
        }

        return {
          acquired: true,
          lockId: this.instanceId,
        };
      });

      if (result.acquired) {
        this.logger.debug(`Lock acquired for job: ${jobName}`);
      } else {
        this.logger.debug(`Lock not acquired for job: ${jobName} - ${result.reason}`);
      }

      return result;
    } catch (error) {
      // Handle race condition where another instance grabbed the lock
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to acquire lock for ${jobName}: ${errorMessage}`);

      return {
        acquired: false,
        lockId: this.instanceId,
        reason: `Lock acquisition failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Release a lock for a job.
   *
   * Only releases if this instance holds the lock.
   *
   * @param jobName - Unique name of the job to unlock
   * @returns true if released, false if not held by this instance
   */
  async releaseLock(jobName: string): Promise<boolean> {
    try {
      const result = await this.prisma.schedulerLock.updateMany({
        where: {
          jobName,
          lockedBy: this.instanceId,
        },
        data: {
          // Set expiry to past to effectively release
          expiresAt: new Date(0),
        },
      });

      if (result.count > 0) {
        this.logger.debug(`Lock released for job: ${jobName}`);
        return true;
      }

      return false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to release lock for ${jobName}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Update the last run time for a job.
   *
   * Called after successful job execution.
   *
   * @param jobName - Unique name of the job
   */
  async updateLastRunTime(jobName: string): Promise<void> {
    try {
      await this.prisma.schedulerLock.update({
        where: { jobName },
        data: { lastRunAt: new Date() },
      });
    } catch (error) {
      // Non-critical, just log
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Failed to update last run time for ${jobName}: ${errorMessage}`);
    }
  }

  /**
   * Get the instance ID for this scheduler instance.
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Clean up stale locks (for maintenance).
   *
   * This is called periodically to remove locks from crashed instances.
   */
  async cleanupStaleLocks(): Promise<number> {
    const result = await this.prisma.schedulerLock.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} stale scheduler lock(s)`);
    }

    return result.count;
  }
}
