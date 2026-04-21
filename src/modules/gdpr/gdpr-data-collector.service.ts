import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  GdprIdentityData,
  GdprProfileData,
  GdprNotificationData,
  GdprNotificationRecord,
  GdprNotificationPreferencesData,
} from './gdpr-collection.types';

/**
 * GDPR Data Collector Service
 *
 * Implements Phase 3 of the GDPR system: data collection.
 * This service contains individual collector methods for each GDPR data source.
 *
 * ───────────────────────────────────────────────────────────────
 * Purpose:
 * ───────────────────────────────────────────────────────────────
 * - Gather user data from registered GDPR tables
 * - Return plain JSON-serializable objects
 * - Handle errors gracefully (fail-safe per source)
 * - NO export formatting (that's Phase 4)
 * - NO file generation (that's Phase 4)
 * - NO storage logic (that's Phase 4)
 *
 * ───────────────────────────────────────────────────────────────
 * Design Principles:
 * ───────────────────────────────────────────────────────────────
 * - Each collector handles ONE bounded concern
 * - Collectors return domain-specific types (not Prisma models)
 * - Collectors are independent (can fail individually)
 * - No cross-domain joins (keep concerns separated)
 * - No side effects (read-only operations)
 *
 * ───────────────────────────────────────────────────────────────
 * Extension Pattern:
 * ───────────────────────────────────────────────────────────────
 * To add a new data source:
 * 1. Register table in gdpr.registry.ts
 * 2. Add type to gdpr-collection.types.ts
 * 3. Add collector method here (collectXXX)
 * 4. Add invocation in orchestrator service
 *
 * @see gdpr.registry.ts for registered tables
 * @see gdpr-collection.types.ts for data structure definitions
 * @see gdpr-data-orchestrator.service.ts for collection orchestration
 */
@Injectable()
export class GdprDataCollectorService {
  private readonly logger = new Logger(GdprDataCollectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────
  // Identity Data Collection
  // ─────────────────────────────────────────────────────────────

  /**
   * Collect user identity data.
   *
   * This is the ownership anchor - all other data belongs to this identity.
   * Identity data is always included in exports.
   *
   * @param identityId - The identity ID to collect data for
   * @returns Identity data
   * @throws Error if identity not found
   */
  async collectIdentity(identityId: string): Promise<GdprIdentityData> {
    this.logger.debug(`[Collector] Collecting identity data for: ${identityId}`);

    const identity = await this.prisma.identity.findUnique({
      where: { id: identityId },
      select: {
        id: true,
        externalUserId: true,
        isFlagged: true,
        isSuspended: true,
        lastActivity: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!identity) {
      throw new Error(`Identity not found: ${identityId}`);
    }

    return {
      id: identity.id,
      externalUserId: identity.externalUserId,
      isFlagged: identity.isFlagged,
      isSuspended: identity.isSuspended,
      lastActivity: identity.lastActivity,
      createdAt: identity.createdAt,
      updatedAt: identity.updatedAt,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Profile Data Collection
  // ─────────────────────────────────────────────────────────────

  /**
   * Collect user profile data.
   *
   * Profile is optional - not all users have profiles.
   * Returns null if profile doesn't exist.
   *
   * @param identityId - The identity ID to collect profile for
   * @returns Profile data or null if not found
   */
  async collectProfile(identityId: string): Promise<GdprProfileData | null> {
    this.logger.debug(`[Collector] Collecting profile data for: ${identityId}`);

    const profile = await this.prisma.profile.findUnique({
      where: { identityId },
      select: {
        id: true,
        displayName: true,
        language: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!profile) {
      this.logger.debug(`[Collector] No profile found for identity: ${identityId}`);
      return null;
    }

    return {
      id: profile.id,
      displayName: profile.displayName,
      language: profile.language,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Notification Data Collection
  // ─────────────────────────────────────────────────────────────

  /**
   * Collect user notification history.
   *
   * Includes all notifications sent to the user (read and unread).
   * Returns empty array if no notifications exist.
   *
   * Design Note: Notification data is stored in JSON payload.
   * The schema uses a flexible payload structure that different
   * notification types interpret differently.
   *
   * @param identityId - The identity ID to collect notifications for
   * @returns Notification data (always succeeds, returns empty array if none)
   */
  async collectNotifications(identityId: string): Promise<GdprNotificationData> {
    this.logger.debug(`[Collector] Collecting notifications for: ${identityId}`);

    const notifications = await this.prisma.notificationLog.findMany({
      where: { identityId },
      select: {
        id: true,
        type: true,
        payload: true,
        visibleAt: true,
        readAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' }, // Most recent first
    });

    this.logger.debug(
      `[Collector] Found ${notifications.length} notifications for identity: ${identityId}`,
    );

    const notificationRecords: GdprNotificationRecord[] = notifications.map((n) => {
      // Extract title and body from payload (flexible structure)
      const payload = n.payload as Record<string, unknown>;
      const title = typeof payload?.title === 'string' ? payload.title : '';
      const body = typeof payload?.body === 'string' ? payload.body : '';

      return {
        id: n.id,
        type: n.type,
        title,
        body,
        isRead: n.readAt !== null,
        createdAt: n.createdAt,
        readAt: n.readAt,
      };
    });

    return {
      totalCount: notificationRecords.length,
      notifications: notificationRecords,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Notification Preferences Collection
  // ─────────────────────────────────────────────────────────────

  /**
   * Collect user notification preferences and delivery channels.
   *
   * Returns channel information including email addresses and push device info.
   * Note: Sensitive tokens (expo push tokens) are NOT included for security.
   * Returns null if user hasn't configured notification preferences.
   *
   * @param identityId - The identity ID to collect preferences for
   * @returns Notification preferences with full channel details or null if not configured
   */
  async collectNotificationPreferences(
    identityId: string,
  ): Promise<GdprNotificationPreferencesData | null> {
    this.logger.debug(`[Collector] Collecting notification preferences for: ${identityId}`);

    const preferences = await this.prisma.userNotificationProfile.findUnique({
      where: { identityId },
      include: {
        emailChannels: {
          select: {
            email: true,
            enabled: true,
            promoEnabled: true,
            createdAt: true,
          },
        },
        pushChannels: {
          select: {
            platform: true,
            uniqueKey: true,
            expoToken: true,
            isActive: true,
            createdAt: true,
          },
        },
      },
    });

    if (!preferences) {
      this.logger.debug(
        `[Collector] No notification preferences found for identity: ${identityId}`,
      );
      return null;
    }

    // Build channels array based on active delivery methods
    const channels: string[] = [];
    if (preferences.emailChannels && preferences.emailChannels.length > 0) {
      channels.push('EMAIL');
    }
    if (preferences.pushChannels && preferences.pushChannels.length > 0) {
      channels.push('PUSH');
    }

    // Map email channels (include full details for GDPR export)
    const emailChannels = preferences.emailChannels.map((ec) => ({
      email: ec.email,
      enabled: ec.enabled,
      promoEnabled: ec.promoEnabled,
      createdAt: ec.createdAt,
    }));

    // Map push channels (mask expo tokens for security, include device info)
    const pushChannels = preferences.pushChannels.map((pc) => ({
      platform: pc.platform,
      deviceKey: pc.uniqueKey, // Device identifier for user recognition
      expoTokenMasked: this.maskExpoToken(pc.expoToken), // Masked for security
      isActive: pc.isActive,
      createdAt: pc.createdAt,
    }));

    this.logger.debug(
      `[Collector] Found ${emailChannels.length} email channel(s), ${pushChannels.length} push channel(s)`,
    );

    return {
      id: preferences.id,
      channels,
      emailChannels,
      pushChannels,
      createdAt: preferences.createdAt,
      updatedAt: preferences.updatedAt,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────

  /**
   * Mask an Expo push token for GDPR export.
   *
   * Security consideration: Full expo tokens could be used to send
   * unauthorized push notifications if leaked. We mask the middle
   * portion while still allowing the user to verify they own the token.
   *
   * Format: "ExponentPushToken[xxxxxx...]" → "ExponentPushToken[xx...xx]"
   *
   * @param token - The full expo push token
   * @returns Masked token showing first 20 chars + "..." + last 4 chars
   */
  private maskExpoToken(token: string): string {
    if (!token || token.length <= 30) {
      // Short tokens - just show first 10 and last 4
      if (token.length <= 14) return token;
      return `${token.slice(0, 10)}...${token.slice(-4)}`;
    }
    // Standard format: show enough to recognize, mask the middle
    return `${token.slice(0, 20)}...${token.slice(-4)}`;
  }

  // ─────────────────────────────────────────────────────────────
  // Future Extension Points (Examples)
  // ─────────────────────────────────────────────────────────────

  /**
   * Example pattern for future data sources.
   *
   * When adding new GDPR data sources:
   * 1. Register in gdpr.registry.ts
   * 2. Define types in gdpr-collection.types.ts
   * 3. Add collector method here following this pattern:
   *
   * async collectOrders(identityId: string): Promise<GdprOrderData[]> {
   *   this.logger.debug(`[Collector] Collecting orders for: ${identityId}`);
   *
   *   const orders = await this.prisma.order.findMany({
   *     where: { identityId },
   *     select: { ... },
   *   });
   *
   *   return orders.map(order => ({ ... }));
   * }
   *
   * Guidelines:
   * - One collector per bounded domain
   * - Return domain-specific types (not Prisma models)
   * - Handle "not found" gracefully (return null or empty array)
   * - Log at debug level for traceability
   * - Keep queries focused (no cross-domain joins)
   */
}
