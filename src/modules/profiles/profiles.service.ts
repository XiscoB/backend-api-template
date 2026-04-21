import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Profile, Identity } from '@prisma/client';
import { ProfilesRepository } from './profiles.repository';
import { IdentityService } from '../identity/identity.service';
import { NotificationProfileService } from '../notifications/notification-profile.service';
import { CreateProfileDto } from './v1/dto/create-profile.dto';
import { UpdateProfileDto } from './v1/dto/update-profile.dto';

/**
 * Profile with Identity relation for response mapping.
 */
export interface ProfileWithIdentity extends Profile {
  identity: Identity;
}

/**
 * Profiles service.
 *
 * Contains business logic for profile operations.
 * This service is version-agnostic and can be used by multiple API versions.
 *
 * IMPORTANT: This service resolves Identity from externalUserId at the boundary,
 * then operates on identityId internally.
 */
@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly identityService: IdentityService,
    private readonly notificationProfileService: NotificationProfileService,
  ) {}

  /**
   * Get the profile for the current user.
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @throws NotFoundException if profile does not exist
   */
  async getMyProfile(externalUserId: string): Promise<ProfileWithIdentity> {
    // Resolve Identity at the boundary (lazy creation)
    const identity = await this.identityService.resolveIdentity(externalUserId);

    const profile = await this.profilesRepository.findByIdentityId(identity.id);

    if (!profile) {
      throw new NotFoundException('Profile not found. Create one using POST /api/v1/profiles/me');
    }

    // Return profile with identity for response mapping
    return { ...profile, identity };
  }

  /**
   * Create or return existing profile for the current user.
   *
   * This operation is idempotent:
   * - If profile exists, returns the existing profile
   * - If profile does not exist, creates and returns a new one
   *
   * IMPORTANT: This also ensures a notification profile exists for the user.
   * See Task 1 in the notification channels requirements.
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @param dto - Profile creation data
   */
  async createMyProfile(
    externalUserId: string,
    dto: CreateProfileDto,
  ): Promise<ProfileWithIdentity> {
    // Resolve Identity at the boundary (lazy creation)
    const identity = await this.identityService.resolveIdentity(externalUserId);

    const profile = await this.profilesRepository.upsert({
      identityId: identity.id,
      displayName: dto.displayName,
      language: dto.language, // Pass through (defaults to 'en' in repository)
    });

    // Ensure notification profile exists (idempotent)
    // This guarantees every user has notification delivery capability
    await this.ensureNotificationProfile(identity.id, dto.language);

    // Return profile with identity for response mapping
    return { ...profile, identity };
  }

  /**
   * Ensure a notification profile exists for the given identity.
   *
   * This is called during profile creation to guarantee every user
   * has a notification profile. The operation is idempotent.
   *
   * @param identityId - The identity ID
   * @param language - Optional preferred language (defaults to 'en')
   */
  private async ensureNotificationProfile(identityId: string, language?: string): Promise<void> {
    try {
      await this.notificationProfileService.ensureProfileExists(identityId, language);
      this.logger.debug(`Notification profile ensured for identity: ${identityId}`);
    } catch (error) {
      // Log but don't fail profile creation - notification profile is best-effort
      this.logger.error(
        `Failed to ensure notification profile for identity ${identityId}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Check if a profile exists for the given external user ID.
   */
  async profileExists(externalUserId: string): Promise<boolean> {
    const identity = await this.identityService.getIdentityByExternalUserId(externalUserId);
    if (!identity) {
      return false;
    }
    const profile = await this.profilesRepository.findByIdentityId(identity.id);
    return profile !== null;
  }

  /**
   * Update the current user's profile (partial update).
   *
   * Supports updating one or more fields at a time.
   * Only provided fields are updated - missing fields preserve existing data.
   *
   * This enables tab-based incremental profile editing where different
   * sections of the app update different parts of the profile independently.
   *
   * @param externalUserId - The external user ID from JWT 'sub' claim
   * @param dto - Profile update data (all fields optional)
   * @throws NotFoundException if profile does not exist
   */
  async updateMyProfile(
    externalUserId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileWithIdentity> {
    // Resolve Identity at the boundary
    const identity = await this.identityService.resolveIdentity(externalUserId);

    // Get existing profile
    const existingProfile = await this.profilesRepository.findByIdentityId(identity.id);

    if (!existingProfile) {
      throw new NotFoundException('Profile not found. Create one using POST /api/v1/profiles/me');
    }

    // Perform partial update
    const updatedProfile = await this.profilesRepository.updatePartial(existingProfile.id, dto);

    // If language was updated, sync it to notification profile
    if (dto.language) {
      await this.syncLanguageToNotificationProfile(identity.id, dto.language);
    }

    // Return profile with identity for response mapping
    return { ...updatedProfile, identity };
  }

  /**
   * Sync language preference to notification profile.
   *
   * When a user updates their language preference, we also update
   * their notification profile to ensure notifications are delivered
   * in the correct language.
   *
   * @param identityId - The identity ID
   * @param language - The new language preference
   */
  private async syncLanguageToNotificationProfile(
    identityId: string,
    language: string,
  ): Promise<void> {
    try {
      await this.notificationProfileService.updateLanguage(identityId, language);
      this.logger.debug(`Language synced to notification profile for identity: ${identityId}`);
    } catch (error) {
      // Log but don't fail profile update - notification profile sync is best-effort
      this.logger.error(
        `Failed to sync language to notification profile for identity ${identityId}: ${(error as Error).message}`,
      );
    }
  }
}
