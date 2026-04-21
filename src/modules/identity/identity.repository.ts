import { Injectable } from '@nestjs/common';
import { Identity } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Identity Repository
 *
 * Handles database operations for the Identity entity.
 * All Prisma operations for Identity are encapsulated here.
 *
 * Identity is the ownership root for all person-owned data.
 * This repository is the ONLY place where externalUserId is persisted.
 */
@Injectable()
export class IdentityRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find an Identity by external user ID (JWT sub).
   *
   * This is the primary lookup method at request boundaries.
   */
  async findByExternalUserId(externalUserId: string): Promise<Identity | null> {
    return await this.prisma.identity.findUnique({
      where: { externalUserId },
    });
  }

  /**
   * Find an Identity by internal ID.
   *
   * Use this for domain operations after Identity resolution.
   */
  async findById(id: string): Promise<Identity | null> {
    return await this.prisma.identity.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new Identity.
   *
   * Called during lazy identity creation on first authenticated request.
   */
  async create(externalUserId: string): Promise<Identity> {
    return await this.prisma.identity.create({
      data: {
        externalUserId,
      },
    });
  }

  /**
   * Find or create Identity by external user ID.
   *
   * Atomically ensures Identity exists for the given external user ID.
   * This is the preferred method for lazy identity creation.
   *
   * @throws Error if externalUserId matches an existing Identity.id (collision guard)
   */
  async findOrCreate(externalUserId: string): Promise<Identity> {
    // Collision guard: prevent creating identity where externalUserId = existing identity.id
    // This catches bugs where internal identityId is accidentally passed instead of externalUserId
    // Only check if externalUserId looks like a UUID (matches our id format)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(externalUserId)) {
      const collision = await this.prisma.identity.findUnique({
        where: { id: externalUserId },
      });
      if (collision) {
        throw new Error(
          `Identity collision detected: externalUserId "${externalUserId}" matches an existing identity.id. ` +
            `This usually means an internal identityId was passed instead of externalUserId (JWT sub).`,
        );
      }
    }

    return await this.prisma.identity.upsert({
      where: { externalUserId },
      create: { externalUserId },
      update: {}, // No update on conflict - preserve existing
    });
  }

  /**
   * Update Identity last activity timestamp.
   *
   * Called to track user activity for inactive account detection.
   */
  async updateLastActivity(id: string): Promise<Identity> {
    return await this.prisma.identity.update({
      where: { id },
      data: { lastActivity: new Date() },
    });
  }

  /**
   * Update Identity suspension status.
   */
  async updateSuspensionStatus(id: string, isSuspended: boolean): Promise<Identity> {
    return await this.prisma.identity.update({
      where: { id },
      data: { isSuspended },
    });
  }

  /**
   * Update Identity anonymization status.
   */
  async updateAnonymizationStatus(id: string, anonymized: boolean): Promise<Identity> {
    return await this.prisma.identity.update({
      where: { id },
      data: { anonymized },
    });
  }

  /**
   * Update Identity banned status.
   *
   * BANNED is a permanent, non-recoverable state set by administrators.
   * This is distinct from suspension (user-initiated, recoverable).
   */
  async updateBannedStatus(id: string, isBanned: boolean): Promise<Identity> {
    return await this.prisma.identity.update({
      where: { id },
      data: { isBanned },
    });
  }

  /**
   * Set Identity deletedAt timestamp (logical deletion).
   *
   * @param id - Identity ID
   * @param deletedAt - Timestamp of deletion request, or null to cancel
   */
  async setDeletedAt(id: string, deletedAt: Date | null): Promise<Identity> {
    return await this.prisma.identity.update({
      where: { id },
      data: { deletedAt },
    });
  }

  /**
   * Find all identities pending final deletion.
   *
   * Returns identities where:
   * - deletedAt is set (deletion requested)
   * - deletedAt + grace period has passed
   * - anonymized is false (not yet finalized)
   *
   * @param gracePeriodDays - Grace period in days
   * @param limit - Maximum number of identities to return
   */
  async findPendingFinalDeletion(gracePeriodDays: number, limit: number): Promise<Identity[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);

    return await this.prisma.identity.findMany({
      where: {
        deletedAt: { lte: cutoffDate },
        anonymized: false,
      },
      take: limit,
      orderBy: { deletedAt: 'asc' },
    });
  }

  /**
   * Find identities approaching final deletion (for warning emails).
   *
   * Returns identities where:
   * - deletedAt is set
   * - deletedAt + (gracePeriod - warningDays) has passed
   * - deletedAt + gracePeriod has NOT passed
   * - anonymized is false
   *
   * @param gracePeriodDays - Grace period in days
   * @param warningDays - Days before final deletion to warn
   * @param limit - Maximum number of identities to return
   */
  async findApproachingFinalDeletion(
    gracePeriodDays: number,
    warningDays: number,
    limit: number,
  ): Promise<Identity[]> {
    const now = new Date();
    const warningCutoff = new Date();
    warningCutoff.setDate(now.getDate() - (gracePeriodDays - warningDays));
    const finalCutoff = new Date();
    finalCutoff.setDate(now.getDate() - gracePeriodDays);

    return await this.prisma.identity.findMany({
      where: {
        deletedAt: {
          lte: warningCutoff,
          gt: finalCutoff,
        },
        anonymized: false,
      },
      take: limit,
      orderBy: { deletedAt: 'asc' },
    });
  }

  /**
   * Update Identity flagged status.
   */
  async updateFlaggedStatus(id: string, isFlagged: boolean): Promise<Identity> {
    return await this.prisma.identity.update({
      where: { id },
      data: { isFlagged },
    });
  }

  /**
   * Check if an Identity exists by external user ID.
   */
  async existsByExternalUserId(externalUserId: string): Promise<boolean> {
    const count = await this.prisma.identity.count({
      where: { externalUserId },
    });
    return count > 0;
  }
}
