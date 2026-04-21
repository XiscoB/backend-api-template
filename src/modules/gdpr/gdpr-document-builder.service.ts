import { Injectable, Logger } from '@nestjs/common';
import {
  GdprCollectedData,
  GdprIdentityData,
  GdprProfileData,
  GdprNotificationData,
  GdprNotificationPreferencesData,
} from './gdpr-collection.types';
import {
  GdprExportDocument,
  GdprDocumentMetadata,
  GdprDocumentSection,
  GdprDocumentEntry,
  GdprDocumentField,
  LanguageCode,
  DocumentBuilderOptions,
} from './gdpr-export-document.types';
import { GdprLocalizationService } from './gdpr-localization.service';
import { BRANDING as APP_BRANDING, VERSION } from '../../config/app.constants';

/**
 * GDPR Document Builder Service (Phase 3.5)
 *
 * Transforms raw collected GDPR data into a semantic export document.
 *
 * Responsibilities:
 * - Build GdprExportDocument from GdprCollectedData
 * - Create sections for each data domain
 * - Format field values for human consumption
 * - Look up localized labels and explanations
 * - Enforce deterministic section ordering
 *
 * This service does NOT:
 * - Query the database (uses pre-collected data)
 * - Generate HTML, JSON, or other formats (pure semantic model)
 * - Modify collected data (read-only transformation)
 * - Handle file generation or storage
 *
 * Design:
 * - Each data domain has a dedicated section builder
 * - Sections are built independently (can be parallelized in future)
 * - Empty sections are omitted (null check)
 * - All user-facing text comes from localization service
 * - Field values are formatted consistently (dates, booleans, etc.)
 *
 * Extension:
 * To add a new section:
 * 1. Create a buildXyzSection() method
 * 2. Add it to buildAllSections() in the correct order
 * 3. Add translations to GdprLocalizationService
 * 4. Update GdprCollectedData if needed
 */

/**
 * Branding configuration - sourced from centralized app.constants.ts
 *
 * @see src/config/app.constants.ts - BRANDING is the source of truth
 */
export const BRANDING = {
  companyName: APP_BRANDING.COMPANY_NAME,
  logoPath: APP_BRANDING.LOGO_PATH,
};

@Injectable()
export class GdprDocumentBuilderService {
  private readonly logger = new Logger(GdprDocumentBuilderService.name);

  /** Current document schema version - from centralized constants */
  private readonly defaultSchemaVersion = VERSION.GDPR_SCHEMA_VERSION;

  constructor(private readonly localization: GdprLocalizationService) {}

  /**
   * Build a complete GDPR export document from collected data.
   *
   * This is the main entry point for Phase 3.5.
   *
   * @param collectedData - Raw collected data from Phase 3
   * @param language - User's preferred language
   * @param options - Optional builder configuration
   * @returns Complete semantic export document
   */
  buildDocument(
    collectedData: GdprCollectedData,
    language: LanguageCode,
    options?: Partial<DocumentBuilderOptions>,
  ): GdprExportDocument {
    this.logger.log(
      `[DocumentBuilder] Building GDPR export document for identity: ${collectedData.metadata.identityId}, language: ${language}`,
    );

    const startTime = Date.now();

    // Validate language (fallback to default if unsupported)
    const effectiveLanguage = this.localization.isLanguageSupported(language)
      ? language
      : this.localization.getDefaultLanguage();

    if (language !== effectiveLanguage) {
      this.logger.warn(
        `[DocumentBuilder] Language "${language}" not supported. Falling back to "${effectiveLanguage}".`,
      );
    }

    // Build metadata
    const metadata: GdprDocumentMetadata = {
      generatedAt: new Date(),
      identityId: collectedData.metadata.identityId,
      language: effectiveLanguage,
      schemaVersion: options?.schemaVersion ?? this.defaultSchemaVersion,
    };

    // Build all sections (order matters!)
    const sections = this.buildAllSections(collectedData, effectiveLanguage);

    // Filter out null sections (e.g., profile doesn't exist)
    const finalSections = sections.filter((s) => s !== null);

    const duration = Date.now() - startTime;
    this.logger.log(
      `[DocumentBuilder] Document built successfully: ${finalSections.length} sections, ${duration}ms`,
    );

    return {
      metadata,
      sections: finalSections,
    };
  }

  /**
   * Build all sections in deterministic order.
   *
   * Order is important for user experience:
   * 1. Identity (who you are)
   * 2. Profile (your public info)
   * 3. Notifications (what we've sent you)
   * 4. Preferences (your settings)
   *
   * @param data - Collected GDPR data
   * @param language - User's language
   * @returns Array of sections (nulls filtered out later)
   */
  private buildAllSections(
    data: GdprCollectedData,
    language: LanguageCode,
  ): Array<GdprDocumentSection | null> {
    return [
      this.buildIdentitySection(data.identity, language),
      this.buildProfileSection(data.profile, language),
      this.buildNotificationsSection(data.notifications, language),
      this.buildNotificationPreferencesSection(data.notificationPreferences, language),
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Identity Section Builder
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the Identity section.
   *
   * Identity is always present (required in Phase 3).
   */
  private buildIdentitySection(
    identity: GdprIdentityData,
    language: LanguageCode,
  ): GdprDocumentSection {
    this.logger.debug(`[DocumentBuilder] Building Identity section (language: ${language})`);

    const fields: GdprDocumentField[] = [
      {
        key: 'identityId',
        label: this.localization.getFieldLabel('identityId', language),
        value: identity.id,
        explanation: this.localization.getFieldExplanation('identityId', language),
      },
      {
        key: 'externalUserId',
        label: this.localization.getFieldLabel('externalUserId', language),
        value: identity.externalUserId,
        explanation: this.localization.getFieldExplanation('externalUserId', language),
      },
      {
        key: 'isFlagged',
        label: this.localization.getFieldLabel('isFlagged', language),
        value: this.localization.formatBoolean(identity.isFlagged, language),
        explanation: this.localization.getFieldExplanation('isFlagged', language),
      },
      {
        key: 'isSuspended',
        label: this.localization.getFieldLabel('isSuspended', language),
        value: this.localization.formatBoolean(identity.isSuspended, language),
        explanation: this.localization.getFieldExplanation('isSuspended', language),
      },
      {
        key: 'lastActivity',
        label: this.localization.getFieldLabel('lastActivity', language),
        value: this.formatDate(identity.lastActivity, language),
        explanation: this.localization.getFieldExplanation('lastActivity', language),
      },
      {
        key: 'createdAt',
        label: this.localization.getFieldLabel('createdAt', language),
        value: this.formatDate(identity.createdAt, language),
        explanation: this.localization.getFieldExplanation('createdAt', language),
      },
    ];

    return {
      id: 'identity',
      title: this.localization.getSectionTitle('identity', language),
      description: this.localization.getSectionDescription('identity', language),
      entries: [{ fields }],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Profile Section Builder
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the Profile section.
   *
   * Profile may be null if user hasn't created one.
   */
  private buildProfileSection(
    profile: GdprProfileData | null,
    language: LanguageCode,
  ): GdprDocumentSection | null {
    if (!profile) {
      this.logger.debug(`[DocumentBuilder] Skipping Profile section (no profile data)`);
      return null;
    }

    this.logger.debug(`[DocumentBuilder] Building Profile section (language: ${language})`);

    const fields: GdprDocumentField[] = [
      {
        key: 'displayName',
        label: this.localization.getFieldLabel('displayName', language),
        value: profile.displayName,
        explanation: this.localization.getFieldExplanation('displayName', language),
      },
      {
        key: 'language',
        label: this.localization.getFieldLabel('language', language),
        value: profile.language ?? this.localization.formatNullable(null, language),
        explanation: this.localization.getFieldExplanation('language', language),
      },
      {
        key: 'createdAt',
        label: this.localization.getFieldLabel('createdAt', language),
        value: this.formatDate(profile.createdAt, language),
        explanation: this.localization.getFieldExplanation('createdAt', language),
      },
      {
        key: 'updatedAt',
        label: this.localization.getFieldLabel('updatedAt', language),
        value: this.formatDate(profile.updatedAt, language),
        explanation: this.localization.getFieldExplanation('updatedAt', language),
      },
    ];

    return {
      id: 'profile',
      title: this.localization.getSectionTitle('profile', language),
      description: this.localization.getSectionDescription('profile', language),
      entries: [{ fields }],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Notifications Section Builder
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the Notifications section.
   *
   * Each notification becomes a separate entry.
   */
  private buildNotificationsSection(
    notifications: GdprNotificationData,
    language: LanguageCode,
  ): GdprDocumentSection | null {
    if (notifications.totalCount === 0) {
      this.logger.debug(`[DocumentBuilder] Skipping Notifications section (no notifications)`);
      return null;
    }

    this.logger.debug(
      `[DocumentBuilder] Building Notifications section: ${notifications.totalCount} notifications (language: ${language})`,
    );

    const entries: GdprDocumentEntry[] = notifications.notifications.map((notification) => {
      const fields: GdprDocumentField[] = [
        {
          key: 'notificationId',
          label: this.localization.getFieldLabel('notificationId', language),
          value: notification.id,
          explanation: this.localization.getFieldExplanation('notificationId', language),
        },
        {
          key: 'notificationType',
          label: this.localization.getFieldLabel('notificationType', language),
          value: notification.type,
          explanation: this.localization.getFieldExplanation('notificationType', language),
        },
        {
          key: 'notificationTitle',
          label: this.localization.getFieldLabel('notificationTitle', language),
          value: notification.title,
          explanation: this.localization.getFieldExplanation('notificationTitle', language),
        },
        {
          key: 'notificationBody',
          label: this.localization.getFieldLabel('notificationBody', language),
          value: notification.body,
          explanation: this.localization.getFieldExplanation('notificationBody', language),
        },
        {
          key: 'isRead',
          label: this.localization.getFieldLabel('isRead', language),
          value: this.localization.formatBoolean(notification.isRead, language),
          explanation: this.localization.getFieldExplanation('isRead', language),
        },
        {
          key: 'createdAt',
          label: this.localization.getFieldLabel('createdAt', language),
          value: this.formatDate(notification.createdAt, language),
          explanation: this.localization.getFieldExplanation('createdAt', language),
        },
        {
          key: 'readAt',
          label: this.localization.getFieldLabel('readAt', language),
          value: this.formatDate(notification.readAt, language),
          explanation: this.localization.getFieldExplanation('readAt', language),
        },
      ];

      return { id: notification.id, fields };
    });

    // Build section summary with variable substitution
    const summary = this.localization.getTextWithVariables(
      'section.notifications.summary',
      language,
      { count: notifications.totalCount },
    );

    return {
      id: 'notifications',
      title: this.localization.getSectionTitle('notifications', language),
      description: this.localization.getSectionDescription('notifications', language),
      summary,
      entries,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Notification Preferences Section Builder
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build the Notification Preferences section.
   */
  private buildNotificationPreferencesSection(
    preferences: GdprNotificationPreferencesData | null,
    language: LanguageCode,
  ): GdprDocumentSection | null {
    if (!preferences) {
      this.logger.debug(
        `[DocumentBuilder] Skipping Notification Preferences section (no preferences data)`,
      );
      return null;
    }

    this.logger.debug(
      `[DocumentBuilder] Building Notification Preferences section (language: ${language})`,
    );

    const channelsText =
      preferences.channels.length > 0
        ? preferences.channels.join(', ')
        : this.localization.getText('common.none', language);

    const fields: GdprDocumentField[] = [
      {
        key: 'preferencesId',
        label: this.localization.getFieldLabel('preferencesId', language),
        value: preferences.id,
        explanation: this.localization.getFieldExplanation('preferencesId', language),
      },
      {
        key: 'channels',
        label: this.localization.getFieldLabel('channels', language),
        value: channelsText,
        explanation: this.localization.getFieldExplanation('channels', language),
      },
      {
        key: 'createdAt',
        label: this.localization.getFieldLabel('createdAt', language),
        value: this.formatDate(preferences.createdAt, language),
        explanation: this.localization.getFieldExplanation('createdAt', language),
      },
      {
        key: 'updatedAt',
        label: this.localization.getFieldLabel('updatedAt', language),
        value: this.formatDate(preferences.updatedAt, language),
        explanation: this.localization.getFieldExplanation('updatedAt', language),
      },
    ];

    // Add email channels if present
    if (preferences.emailChannels && preferences.emailChannels.length > 0) {
      preferences.emailChannels.forEach((email, index) => {
        const prefix = preferences.emailChannels.length > 1 ? ` #${index + 1}` : '';
        fields.push({
          key: `emailAddress${index}`,
          label: this.localization.getFieldLabel('emailAddress', language) + prefix,
          value: email.email,
          explanation: this.localization.getFieldExplanation('emailAddress', language),
        });
        fields.push({
          key: `emailEnabled${index}`,
          label: this.localization.getFieldLabel('emailEnabled', language) + prefix,
          value: this.localization.formatBoolean(email.enabled, language),
          explanation: this.localization.getFieldExplanation('emailEnabled', language),
        });
        fields.push({
          key: `emailPromoEnabled${index}`,
          label: this.localization.getFieldLabel('emailPromoEnabled', language) + prefix,
          value: this.localization.formatBoolean(email.promoEnabled, language),
          explanation: this.localization.getFieldExplanation('emailPromoEnabled', language),
        });
      });
    }

    // Add push channels if present
    if (preferences.pushChannels && preferences.pushChannels.length > 0) {
      preferences.pushChannels.forEach((push, index) => {
        const prefix = preferences.pushChannels.length > 1 ? ` #${index + 1}` : '';
        fields.push({
          key: `pushPlatform${index}`,
          label: this.localization.getFieldLabel('pushPlatform', language) + prefix,
          value: push.platform ?? this.localization.formatNullable(null, language),
          explanation: this.localization.getFieldExplanation('pushPlatform', language),
        });
        fields.push({
          key: `pushDeviceKey${index}`,
          label: this.localization.getFieldLabel('pushDeviceKey', language) + prefix,
          value: push.deviceKey,
          explanation: this.localization.getFieldExplanation('pushDeviceKey', language),
        });
        fields.push({
          key: `pushToken${index}`,
          label: this.localization.getFieldLabel('pushToken', language) + prefix,
          value: push.expoTokenMasked,
          explanation: this.localization.getFieldExplanation('pushToken', language),
        });
        fields.push({
          key: `pushActive${index}`,
          label: this.localization.getFieldLabel('pushActive', language) + prefix,
          value: this.localization.formatBoolean(push.isActive, language),
          explanation: this.localization.getFieldExplanation('pushActive', language),
        });
      });
    }

    // Build section summary with variable substitution
    const summary = this.localization.getTextWithVariables(
      'section.preferences.summary',
      language,
      { channels: channelsText },
    );

    return {
      id: 'preferences',
      title: this.localization.getSectionTitle('preferences', language),
      description: this.localization.getSectionDescription('preferences', language),
      summary,
      entries: [{ fields }],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Value Formatting Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Format a date for display.
   *
   * Uses ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ).
   * Returns localized "N/A" for null dates.
   *
   * Future: Could add locale-specific date formatting
   */
  private formatDate(date: Date | null, language: LanguageCode): string {
    if (!date) {
      return this.localization.formatNullable(null, language);
    }

    // ISO 8601 format (universally understood)
    return date.toISOString();
  }
}
