import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Deletion Legal Hold Service
 *
 * Provides structural support for blocking account deletion in exceptional
 * legal circumstances.
 *
 * ────────────────────────────────────────────────────────────────────────
 * IMPORTANT: This is a MINIMAL ARCHITECTURAL HOOK, not a full feature.
 * ────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ THIS IS NOT:
 * - Data retention (does NOT preserve any user data)
 * - Statutory retention (invoices, payments - SEPARATE concern)
 * - Fraud prevention (use isBanned instead)
 * - General-purpose legal hold (scoped ONLY to deletion)
 *
 * What this service does:
 * - Checks if an active deletion legal hold exists for an identity
 * - Cleans up expired deletion legal holds automatically
 *
 * What this service does NOT do:
 * - Retain or preserve any personal data
 * - Provide workflows for creating/extending holds
 * - Assume specific legal bases or jurisdictions
 * - Implement business-specific retention rules
 *
 * Design Principles:
 * - Deletion legal holds are EXCEPTIONAL and MANUAL
 * - They block deletion temporarily, nothing else
 * - They do NOT retain personal data
 * - They MUST have an expiration date
 * - Expired holds are automatically removed
 *
 * Usage:
 * - Business layer is responsible for creating DeletionLegalHold records
 * - This service only provides the guard check and cleanup
 *
 * @see prisma/schema.prisma - DeletionLegalHold model documentation
 * @see docs/DELETION_LEGAL_HOLD.md
 */
@Injectable()
export class DeletionLegalHoldService {
  private readonly logger = new Logger(DeletionLegalHoldService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if an identity has an active (non-expired) deletion legal hold.
   *
   * This is the primary guard check used before deletion.
   *
   * @param identityId - The internal identity ID (NOT external user ID)
   * @returns true if deletion should be blocked
   */
  async hasActiveDeletionLegalHold(identityId: string): Promise<boolean> {
    const now = new Date();

    const activeHold = await this.prisma.deletionLegalHold.findFirst({
      where: {
        identityId,
        expiresAt: { gt: now }, // Not yet expired
      },
      select: { id: true }, // Minimal query
    });

    return activeHold !== null;
  }

  /**
   * Get active deletion legal holds for an identity.
   *
   * Useful for error messages or admin views.
   *
   * @param identityId - The internal identity ID
   * @returns Array of active deletion legal holds (may be empty)
   */
  async getActiveDeletionLegalHolds(identityId: string): Promise<
    Array<{
      id: string;
      reason: string;
      legalBasis: string;
      expiresAt: Date;
      createdAt: Date;
    }>
  > {
    const now = new Date();

    return await this.prisma.deletionLegalHold.findMany({
      where: {
        identityId,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        reason: true,
        legalBasis: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  /**
   * Clean up all expired deletion legal holds.
   *
   * This should be called periodically via cron to ensure:
   * - No indefinite deletion blocks exist
   * - GDPR time-bounded compliance is maintained
   *
   * Cleanup is idempotent and safe to run multiple times.
   *
   * @param limit - Maximum number of records to delete per run (default: 100)
   * @returns Number of expired holds removed
   */
  async cleanupExpiredHolds(limit: number = 100): Promise<number> {
    const now = new Date();

    // Find expired holds
    const expiredHolds = await this.prisma.deletionLegalHold.findMany({
      where: {
        expiresAt: { lte: now },
      },
      select: { id: true, identityId: true },
      take: limit,
    });

    if (expiredHolds.length === 0) {
      return 0;
    }

    // Delete expired holds
    const result = await this.prisma.deletionLegalHold.deleteMany({
      where: {
        id: { in: expiredHolds.map((h) => h.id) },
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Cleaned up ${result.count} expired deletion legal hold(s). ` +
          `Affected identities: ${[...new Set(expiredHolds.map((h) => h.identityId.slice(0, 8)))].join(', ')}...`,
      );
    }

    return result.count;
  }

  /**
   * Get count of all active deletion legal holds.
   *
   * Useful for monitoring/health checks.
   */
  async getActiveHoldCount(): Promise<number> {
    const now = new Date();

    return await this.prisma.deletionLegalHold.count({
      where: {
        expiresAt: { gt: now },
      },
    });
  }
}
