import { Injectable, Logger } from '@nestjs/common';
import { UserNotificationProfile, UserEmailChannel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { randomUUID } from 'crypto';

/**
 * Notification Profile Service
 *
 * Manages UserNotificationProfile lifecycle and notification channel configuration.
 *
 * Key responsibilities:
 * - Ensure notification profiles exist for users (idempotent creation)
 * - Manage email channels (add, update, verify, enable/disable)
 * - Manage push channels (register, update, deactivate)
 *
 * This service operates on identityId, NOT externalUserId.
 * Identity resolution happens at the boundary (controller/calling service).
 */
@Injectable()
export class NotificationProfileService {
  private readonly logger = new Logger(NotificationProfileService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────
  // Profile Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Ensure a notification profile exists for the given identity.
   *
   * This operation is idempotent:
   * - If profile exists, returns the existing profile
   * - If profile does not exist, creates and returns a new one
   *
   * @param identityId - The identity ID
   * @param language - Optional preferred language (defaults to 'en')
   * @returns The existing or newly created profile
   */
  async ensureProfileExists(
    identityId: string,
    language?: string,
  ): Promise<UserNotificationProfile> {
    const existing = await this.prisma.userNotificationProfile.findUnique({
      where: { identityId },
    });

    if (existing) {
      return existing;
    }

    this.logger.log(`Creating notification profile for identity: ${identityId}`);

    return await this.prisma.userNotificationProfile.create({
      data: {
        identityId,
        notificationsEnabled: true,
        language: language ?? 'en',
      },
    });
  }

  /**
   * Get the notification profile for an identity.
   *
   * @param identityId - The identity ID
   * @returns The notification profile, or null if not found
   */
  async getProfile(identityId: string): Promise<UserNotificationProfile | null> {
    return await this.prisma.userNotificationProfile.findUnique({
      where: { identityId },
    });
  }

  /**
   * Get the notification profile with all channels.
   */
  async getProfileWithChannels(
    identityId: string,
  ): Promise<(UserNotificationProfile & { emailChannels: UserEmailChannel[] }) | null> {
    return await this.prisma.userNotificationProfile.findUnique({
      where: { identityId },
      include: {
        emailChannels: true,
      },
    });
  }

  /**
   * Update notification profile settings.
   */
  async updateProfile(
    identityId: string,
    data: {
      notificationsEnabled?: boolean;
      language?: string;
    },
  ): Promise<UserNotificationProfile> {
    return await this.prisma.userNotificationProfile.update({
      where: { identityId },
      data,
    });
  }

  /**
   * Update language preference for notification profile.
   *
   * Convenience method for syncing language changes from user profile.
   *
   * @param identityId - The identity ID
   * @param language - The new language preference (ISO 639-1 code)
   */
  async updateLanguage(identityId: string, language: string): Promise<UserNotificationProfile> {
    return await this.updateProfile(identityId, { language });
  }

  /**
   * Disable all notifications for an identity.
   *
   * Called during GDPR deletion to immediately suppress notifications.
   * This is a soft-disable that preserves the profile for audit purposes.
   *
   * GDPR INVARIANT: This is one layer of defense-in-depth.
   * Notification services also check identity.deletedAt directly.
   *
   * @param identityId - The identity ID
   * @returns True if profile was disabled, false if no profile existed
   */
  async disableNotificationsForIdentity(identityId: string): Promise<boolean> {
    const result = await this.prisma.userNotificationProfile.updateMany({
      where: { identityId },
      data: { notificationsEnabled: false },
    });

    if (result.count > 0) {
      this.logger.log(`Disabled notifications for identity: ${identityId}`);
    }

    return result.count > 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Email Channel Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Add or update an email channel for the user.
   *
   * @param identityId - The identity ID
   * @param email - The email address
   * @param options - Optional settings
   * @returns The created or updated email channel
   */
  async upsertEmailChannel(
    identityId: string,
    email: string,
    options?: {
      enabled?: boolean;
      promoEnabled?: boolean;
    },
  ): Promise<UserEmailChannel> {
    // First ensure profile exists
    const profile = await this.ensureProfileExists(identityId);

    // Check if email already exists for this profile
    const existing = await this.prisma.userEmailChannel.findFirst({
      where: {
        notificationProfileId: profile.id,
        email,
      },
    });

    if (existing) {
      // Update existing channel
      return await this.prisma.userEmailChannel.update({
        where: { id: existing.id },
        data: {
          enabled: options?.enabled ?? existing.enabled,
          promoEnabled: options?.promoEnabled ?? existing.promoEnabled,
        },
      });
    }

    // Create new channel
    return await this.prisma.userEmailChannel.create({
      data: {
        notificationProfileId: profile.id,
        email,
        enabled: options?.enabled ?? true,
        promoEnabled: options?.promoEnabled ?? false,
        unsubscribeToken: randomUUID(),
      },
    });
  }

  /**
   * Enable or disable an email channel.
   */
  async setEmailChannelEnabled(channelId: string, enabled: boolean): Promise<UserEmailChannel> {
    return await this.prisma.userEmailChannel.update({
      where: { id: channelId },
      data: { enabled },
    });
  }

  /**
   * Get an email channel by ID.
   */
  async getEmailChannel(channelId: string): Promise<UserEmailChannel | null> {
    return await this.prisma.userEmailChannel.findUnique({
      where: { id: channelId },
    });
  }

  /**
   * Get all email channels for a profile.
   */
  async getEmailChannels(profileId: string): Promise<UserEmailChannel[]> {
    return await this.prisma.userEmailChannel.findMany({
      where: { notificationProfileId: profileId },
    });
  }

  /**
   * Delete an email channel.
   */
  async deleteEmailChannel(channelId: string): Promise<UserEmailChannel> {
    return await this.prisma.userEmailChannel.delete({
      where: { id: channelId },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Push Channel Management (Removed from Base)
  // ─────────────────────────────────────────────────────────────
  // Push channel management is project-specific.
  // Base template does not store push tokens.
}
