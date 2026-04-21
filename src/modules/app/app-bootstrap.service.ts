/**
 * App Bootstrap Service
 *
 * Builds the bootstrap response from internal app.constants.ts
 *
 * This service is the ONLY place where app.constants.ts values
 * are transformed into the public DTO contract.
 *
 * RESPONSIBILITIES:
 * - Read from app.constants.ts (internal)
 * - Transform to AppBootstrapResponseDto (public contract)
 * - Generate localized update messages
 *
 * DOES NOT:
 * - Expose internal constants directly
 * - Include per-user or auth data
 * - Query the database
 * - Include secrets or environment variables
 */

import { Injectable, Logger } from '@nestjs/common';
import { VERSION, FEATURE_FLAGS, BRANDING, I18N } from '../../config/app.constants';
import {
  AppBootstrapResponseDto,
  UpdatePolicyDto,
  PlatformUpdatePolicyDto,
  UpdateMessageDto,
  AppMetadataDto,
  BrandingDto,
  FeatureFlagsDto,
  I18nDto,
  Platform,
} from './v1/dto/app-bootstrap.dto';

/**
 * Update message templates per language.
 *
 * These are the default messages shown when an update is available.
 * Extend this object to support more languages.
 */
const UPDATE_MESSAGES: Record<string, { title: string; body: string }> = {
  en: {
    title: 'Update Available',
    body: 'A new version of the app is available. Please update to continue using all features.',
  },
  es: {
    title: 'Actualización Disponible',
    body: 'Una nueva versión de la aplicación está disponible. Por favor actualiza para continuar usando todas las funciones.',
  },
};

/**
 * Force update message templates per language.
 *
 * These are the messages shown when an update is mandatory.
 */
const FORCE_UPDATE_MESSAGES: Record<string, { title: string; body: string }> = {
  en: {
    title: 'Update Required',
    body: 'This version of the app is no longer supported. Please update to continue.',
  },
  es: {
    title: 'Actualización Requerida',
    body: 'Esta versión de la aplicación ya no es compatible. Por favor actualiza para continuar.',
  },
};

@Injectable()
export class AppBootstrapService {
  private readonly logger = new Logger(AppBootstrapService.name);

  /**
   * Get the complete bootstrap configuration.
   *
   * This is called by the controller and returns the full DTO.
   */
  getBootstrapConfig(): AppBootstrapResponseDto {
    this.logger.debug('[Bootstrap] Building bootstrap configuration');

    return {
      updatePolicy: this.buildUpdatePolicy(),
      metadata: this.buildMetadata(),
      features: this.buildFeatureFlags(),
      i18n: this.buildI18n(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private Builders
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build update policy for all platforms.
   */
  private buildUpdatePolicy(): UpdatePolicyDto {
    return {
      ios: this.buildPlatformUpdatePolicy('ios'),
      android: this.buildPlatformUpdatePolicy('android'),
      web: this.buildPlatformUpdatePolicy('web'),
    };
  }

  /**
   * Build update policy for a specific platform.
   *
   * Currently uses a simple model where the minimum version is the
   * first version in the compatible list. Extend this for more
   * sophisticated version policies.
   */
  private buildPlatformUpdatePolicy(platform: Platform): PlatformUpdatePolicyDto {
    // Get minimum version from compatible versions list
    // The first element is typically the oldest still-supported version
    let minimumVersion: string = VERSION.APP_VERSION;

    switch (platform) {
      case 'ios':
        minimumVersion = VERSION.COMPATIBLE_VERSIONS.IOS[0] ?? VERSION.APP_VERSION;
        break;
      case 'android':
        minimumVersion = VERSION.COMPATIBLE_VERSIONS.ANDROID[0] ?? VERSION.APP_VERSION;
        break;
      case 'web':
        // Web uses current app version (always latest)
        minimumVersion = VERSION.APP_VERSION;
        break;
    }

    // Determine if this is a force update based on version gap
    // For now, force update is false by default
    // In production, you might compare semver to determine force
    const forceUpdate = false;

    // Build localized messages
    const messages = this.buildUpdateMessages(forceUpdate);

    return {
      minimumVersion,
      forceUpdate,
      messages,
    };
  }

  /**
   * Build localized update messages.
   *
   * Always includes EN as fallback.
   */
  private buildUpdateMessages(forceUpdate: boolean): UpdateMessageDto[] {
    const messageTemplates = forceUpdate ? FORCE_UPDATE_MESSAGES : UPDATE_MESSAGES;
    const messages: UpdateMessageDto[] = [];

    // Always include EN first (fallback)
    if (messageTemplates.en) {
      messages.push({
        language: 'en',
        title: messageTemplates.en.title,
        body: messageTemplates.en.body,
      });
    }

    // Add other supported languages
    for (const lang of I18N.SUPPORTED_LANGUAGES) {
      if (lang === 'en') continue; // Already added
      if (messageTemplates[lang]) {
        messages.push({
          language: lang,
          title: messageTemplates[lang].title,
          body: messageTemplates[lang].body,
        });
      }
    }

    return messages;
  }

  /**
   * Build app metadata.
   */
  private buildMetadata(): AppMetadataDto {
    return {
      apiVersion: VERSION.APP_VERSION,
      policiesVersion: VERSION.POLICIES_VERSION,
      branding: this.buildBranding(),
    };
  }

  /**
   * Build branding info.
   *
   * Only includes what the client needs for display.
   * Does NOT include internal paths like logo file paths.
   */
  private buildBranding(): BrandingDto {
    return {
      companyName: BRANDING.COMPANY_NAME,
      supportEmail: BRANDING.SUPPORT_EMAIL,
    };
  }

  /**
   * Build feature flags.
   *
   * Maps internal flag names to public DTO names.
   * This mapping is intentional - internal names may differ from public contract.
   */
  private buildFeatureFlags(): FeatureFlagsDto {
    return {
      premiumEnabled: FEATURE_FLAGS.IS_PREMIUM_ENABLED,
      pushNotificationsEnabled: FEATURE_FLAGS.IS_PUSH_ENABLED,
      emailNotificationsEnabled: FEATURE_FLAGS.IS_EMAIL_ENABLED,
      dataExportEnabled: FEATURE_FLAGS.IS_GDPR_EXPORT_ENABLED,
      accountSuspensionEnabled: FEATURE_FLAGS.IS_SUSPENSION_ENABLED,
    };
  }

  /**
   * Build i18n settings.
   */
  private buildI18n(): I18nDto {
    return {
      defaultLanguage: I18N.DEFAULT_LANGUAGE,
      // Convert readonly tuple to mutable array for DTO
      supportedLanguages: [...I18N.SUPPORTED_LANGUAGES],
    };
  }
}
