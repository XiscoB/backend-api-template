import { Injectable, ForbiddenException } from '@nestjs/common';
import { Identity } from '@prisma/client';
import { IdentityRepository } from './identity.repository';

/**
 * Identity Service
 *
 * Business logic for Identity operations.
 * This service is version-agnostic and can be used by multiple API versions.
 *
 * Key responsibilities:
 * - Resolve Identity from JWT sub (lazy creation)
 * - Enforce Identity-level policy (suspension, anonymization)
 * - Provide Identity for domain services
 *
 * @see docs/create_tables_guideline.md
 * @see agents.md Section 8: Identity & Ownership Model
 */
@Injectable()
export class IdentityService {
  constructor(private readonly identityRepository: IdentityRepository) {}

  /**
   * Resolve Identity from external user ID (JWT sub).
   *
   * This is the primary entry point at request boundaries.
   * Creates Identity lazily if it doesn't exist.
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @returns The Identity record
   */
  async resolveIdentity(externalUserId: string): Promise<Identity> {
    return await this.identityRepository.findOrCreate(externalUserId);
  }

  /**
   * Resolve Identity and enforce policy.
   *
   * Use this when the request should fail for banned/suspended/anonymized users.
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @throws ForbiddenException if Identity is banned, suspended, or anonymized
   */
  async resolveIdentityWithPolicyEnforcement(externalUserId: string): Promise<Identity> {
    const identity = await this.resolveIdentity(externalUserId);

    // Highest priority: permanent ban
    if (identity.isBanned) {
      throw new ForbiddenException('Account is permanently banned');
    }

    // Next priority: deletion (terminal or grace period)
    if (identity.deletedAt) {
      throw new ForbiddenException('Account deletion is pending');
    }

    // Suspension (reversible)
    if (identity.isSuspended) {
      throw new ForbiddenException('Account is suspended');
    }

    // Final anonymization (terminal)
    if (identity.anonymized) {
      throw new ForbiddenException('Account has been anonymized');
    }

    return identity;
  }

  /**
   * Get Identity by internal ID.
   *
   * Use this for domain operations where Identity ID is already known.
   */
  async getIdentityById(id: string): Promise<Identity | null> {
    return await this.identityRepository.findById(id);
  }

  /**
   * Get Identity by external user ID without creating.
   *
   * Use this when you need to check if Identity exists without lazy creation.
   */
  async getIdentityByExternalUserId(externalUserId: string): Promise<Identity | null> {
    return await this.identityRepository.findByExternalUserId(externalUserId);
  }

  /**
   * Update last activity timestamp.
   *
   * Call this on authenticated requests to track user activity.
   */
  async updateLastActivity(identityId: string): Promise<void> {
    await this.identityRepository.updateLastActivity(identityId);
  }

  /**
   * Check if Identity exists by external user ID.
   */
  async identityExists(externalUserId: string): Promise<boolean> {
    return await this.identityRepository.existsByExternalUserId(externalUserId);
  }

  /**
   * Suspend an Identity.
   *
   * This sets the isSuspended flag. GDPR suspension logic should use this.
   */
  async suspendIdentity(identityId: string): Promise<Identity> {
    return await this.identityRepository.updateSuspensionStatus(identityId, true);
  }

  /**
   * Resume a suspended Identity.
   *
   * This clears the isSuspended flag.
   */
  async resumeIdentity(identityId: string): Promise<Identity> {
    return await this.identityRepository.updateSuspensionStatus(identityId, false);
  }

  /**
   * Anonymize an Identity.
   *
   * This sets the anonymized flag. GDPR deletion logic should use this.
   */
  async anonymizeIdentity(identityId: string): Promise<Identity> {
    return await this.identityRepository.updateAnonymizationStatus(identityId, true);
  }

  /**
   * Ban an Identity permanently.
   *
   * Sets the isBanned flag. This is an administrative action for abuse/policy violations.
   * BANNED is permanent and non-recoverable - distinct from suspension.
   *
   * @param identityId - Identity ID
   * @returns Updated Identity
   */
  async banIdentity(identityId: string): Promise<Identity> {
    return await this.identityRepository.updateBannedStatus(identityId, true);
  }

  /**
   * Mark Identity as pending deletion.
   *
   * Sets deletedAt timestamp to trigger PENDING_DELETION status.
   * This blocks all authenticated access during the grace period.
   *
   * @param identityId - Identity ID
   * @returns Updated Identity
   */
  async markAsPendingDeletion(identityId: string): Promise<Identity> {
    return await this.identityRepository.setDeletedAt(identityId, new Date());
  }

  /**
   * Cancel pending deletion.
   *
   * Clears deletedAt timestamp, allowing user to regain access.
   * Only possible if anonymized is still false.
   *
   * @param identityId - Identity ID
   * @returns Updated Identity
   */
  async cancelPendingDeletion(identityId: string): Promise<Identity> {
    return await this.identityRepository.setDeletedAt(identityId, null);
  }

  /**
   * Find identities pending final deletion (grace period expired).
   *
   * @param gracePeriodDays - Grace period in days
   * @param limit - Maximum number to return
   */
  async findPendingFinalDeletion(gracePeriodDays: number, limit: number): Promise<Identity[]> {
    return await this.identityRepository.findPendingFinalDeletion(gracePeriodDays, limit);
  }

  /**
   * Find identities approaching final deletion (for warning emails).
   *
   * @param gracePeriodDays - Grace period in days
   * @param warningDays - Days before final deletion to warn
   * @param limit - Maximum number to return
   */
  async findApproachingFinalDeletion(
    gracePeriodDays: number,
    warningDays: number,
    limit: number,
  ): Promise<Identity[]> {
    return await this.identityRepository.findApproachingFinalDeletion(
      gracePeriodDays,
      warningDays,
      limit,
    );
  }

  /**
   * Flag an Identity for review.
   */
  async flagIdentity(identityId: string): Promise<Identity> {
    return await this.identityRepository.updateFlaggedStatus(identityId, true);
  }

  /**
   * Clear flag from an Identity.
   */
  async unflagIdentity(identityId: string): Promise<Identity> {
    return await this.identityRepository.updateFlaggedStatus(identityId, false);
  }

  /**
   * Get or create the Canonical SYSTEM Identity.
   *
   * Use this for system-level actions/notifications that are not
   * triggered by a specific user.
   */
  async getOrCreateSystemIdentity(): Promise<Identity> {
    const SYSTEM_ID = 'SYSTEM'; // Canonical External ID
    return await this.identityRepository.findOrCreate(SYSTEM_ID);
  }
}
