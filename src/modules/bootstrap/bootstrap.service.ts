/**
 * Authenticated Bootstrap Service
 *
 * Provides authenticated user startup context.
 *
 * RESPONSIBILITIES:
 * - Resolve identity from JWT sub
 * - Determine identity status (ACTIVE/BANNED/SUSPENDED/DELETED)
 * - Return minimal user startup context
 * - Check recovery availability for suspended accounts
 *
 * DOES NOT:
 * - Issue or validate tokens (JWT guard does that)
 * - Return app-level config (public bootstrap does that)
 * - Modify identity state
 *
 * @see docs/canonical/AUTH_CONTRACT.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { Identity } from '@prisma/client';
import { IdentityService } from '../identity/identity.service';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { GdprSuspensionService } from '../gdpr/gdpr-suspension.service';
import {
  IdentityStatus,
  AuthenticatedBootstrapResponse,
  BootstrapProfile,
} from './bootstrap.types';

/**
 * Internal result of identity resolution with full context.
 */
interface IdentityResolutionResult {
  identity: Identity;
  status: IdentityStatus;
  recoveryAvailable: boolean;
}

@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly identityService: IdentityService,
    private readonly profilesRepository: ProfilesRepository,
    private readonly gdprSuspensionService: GdprSuspensionService,
  ) {}

  /**
   * Get authenticated bootstrap context for a user.
   *
   * This is the primary entry point called by the controller.
   * Resolves identity, determines status, and builds response.
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @param roles - User roles from JWT
   * @returns Bootstrap response appropriate to user's status
   */
  async getBootstrapContext(
    externalUserId: string,
    roles: string[],
  ): Promise<AuthenticatedBootstrapResponse> {
    this.logger.debug(
      `[Bootstrap] Resolving context for user: ${externalUserId.substring(0, 8)}...`,
    );

    // Step 1: Resolve identity (lazy creation if needed)
    const resolution = await this.resolveIdentityWithStatus(externalUserId);

    // Step 2: Update last activity for active users
    if (resolution.status === 'ACTIVE') {
      await this.identityService.updateLastActivity(resolution.identity.id);
    }

    // Step 3: Build response based on status
    return await this.buildResponse(resolution, roles);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Resolve identity and determine its status.
   *
   * Status determination logic (priority order):
   * 1. isBanned = true → BANNED (permanent, irreversible, admin-only)
   * 2. anonymized = true → DELETED (final, irreversible)
   * 3. deletedAt != null → PENDING_DELETION (grace period active)
   * 4. isSuspended = true + recovery available → PENDING_RECOVERY
   * 5. isSuspended = true + no recovery → SUSPENDED
   * 6. Otherwise → ACTIVE
   */
  private async resolveIdentityWithStatus(
    externalUserId: string,
  ): Promise<IdentityResolutionResult> {
    // Lazy creation: identity is created if it doesn't exist
    const identity = await this.identityService.resolveIdentity(externalUserId);

    // Check for banned accounts - highest priority, administrative action
    if (identity.isBanned) {
      this.logger.debug(`[Bootstrap] Identity ${identity.id} is BANNED`);
      return {
        identity,
        status: 'BANNED',
        recoveryAvailable: false,
      };
    }

    // Check for deleted (anonymized) accounts - final state, irreversible
    if (identity.anonymized) {
      this.logger.debug(`[Bootstrap] Identity ${identity.id} is DELETED (anonymized)`);
      return {
        identity,
        status: 'DELETED',
        recoveryAvailable: false,
      };
    }

    // Check for pending deletion (grace period active)
    // This takes priority over suspension because deletion is a stronger state
    if (identity.deletedAt) {
      this.logger.debug(
        `[Bootstrap] Identity ${identity.id} is PENDING_DELETION (deletedAt: ${identity.deletedAt.toISOString()})`,
      );
      return {
        identity,
        status: 'PENDING_DELETION',
        recoveryAvailable: false,
      };
    }

    // Check for suspended accounts
    if (identity.isSuspended) {
      // Check if recovery is available
      const recoveryAvailable = await this.checkRecoveryAvailable(identity.id);
      const status: IdentityStatus = recoveryAvailable ? 'PENDING_RECOVERY' : 'SUSPENDED';

      this.logger.debug(
        `[Bootstrap] Identity ${identity.id} is ${status} (recoveryAvailable: ${recoveryAvailable})`,
      );

      return {
        identity,
        status,
        recoveryAvailable,
      };
    }

    // Active account
    this.logger.debug(`[Bootstrap] Identity ${identity.id} is ACTIVE`);
    return {
      identity,
      status: 'ACTIVE',
      recoveryAvailable: false,
    };
  }

  /**
   * Check if recovery is available for a suspended identity.
   *
   * Delegates to GDPR suspension service for recovery precondition checks.
   */
  private async checkRecoveryAvailable(identityId: string): Promise<boolean> {
    try {
      const validation = await this.gdprSuspensionService.validateRecoveryPreconditions(identityId);
      return validation.valid;
    } catch (error) {
      // If validation fails (e.g., no suspension found), recovery is not available
      this.logger.debug(`[Bootstrap] Recovery check failed for ${identityId}: ${String(error)}`);
      return false;
    }
  }

  /**
   * Build the bootstrap response based on identity status.
   */
  private async buildResponse(
    resolution: IdentityResolutionResult,
    roles: string[],
  ): Promise<AuthenticatedBootstrapResponse> {
    const { identity, status, recoveryAvailable } = resolution;

    // Blocked users get minimal response
    if (
      status === 'BANNED' ||
      status === 'DELETED' ||
      status === 'SUSPENDED' ||
      status === 'PENDING_RECOVERY' ||
      status === 'PENDING_DELETION'
    ) {
      // Calculate deletion scheduled time for PENDING_DELETION
      let deletionScheduledAt: string | undefined;
      if (status === 'PENDING_DELETION' && identity.deletedAt) {
        // Grace period is configurable, default 30 days
        const gracePeriodDays = parseInt(process.env.GDPR_DELETION_GRACE_PERIOD_DAYS ?? '30', 10);
        const scheduledDate = new Date(identity.deletedAt);
        scheduledDate.setDate(scheduledDate.getDate() + gracePeriodDays);
        deletionScheduledAt = scheduledDate.toISOString();
      }

      return {
        identity: {
          status,
          ...(recoveryAvailable && { recoveryAvailable: true }),
          ...(deletionScheduledAt && { deletionScheduledAt }),
        },
      };
    }

    // Active users get full context
    const profile = await this.getMinimalProfile(identity.id);

    return {
      identity: {
        status: 'ACTIVE',
        roles,
      },
      profile,
    };
  }

  /**
   * Get minimal profile data for bootstrap response.
   *
   * Returns null if profile doesn't exist (user hasn't completed onboarding).
   */
  private async getMinimalProfile(identityId: string): Promise<BootstrapProfile | null> {
    const profile = await this.profilesRepository.findByIdentityId(identityId);

    if (!profile) {
      return null;
    }

    return {
      id: profile.id,
      locale: profile.language, // Map language to locale for client consistency
      timezone: 'UTC', // TODO: Add timezone to profile if needed
    };
  }
}
