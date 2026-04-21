import { Injectable, Logger } from '@nestjs/common';
import { LanguageCode } from './gdpr-export-document.types';
import {
  getTranslations,
  interpolate,
  isLanguageSupported,
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  TranslationSchema,
} from '../../common/translations';

/**
 * GDPR Localization Service (Phase 3.5 → Updated for Global Translations)
 *
 * Provides language-aware text lookup for GDPR export documents.
 *
 * Responsibilities:
 * - Look up text by key and language from global translations
 * - Provide fallback to default language ("en")
 * - Log missing translations for future improvement
 *
 * This service does NOT:
 * - Query the database
 * - Format values (dates, booleans, etc.)
 * - Generate HTML or other formats
 * - Modify GDPR data
 *
 * Design:
 * - Translations are read from src/common/translations/ (single source of truth)
 * - Fallback chain: requested language → "en" → key itself
 * - Missing translations are logged (not errors)
 *
 * Extension:
 * To add a new language:
 * 1. Create new file in src/common/translations/ (e.g., fr.ts)
 * 2. Add to TRANSLATIONS in src/common/translations/index.ts
 * 3. All services using translations will automatically support it
 */
@Injectable()
export class GdprLocalizationService {
  private readonly logger = new Logger(GdprLocalizationService.name);

  /**
   * Get the translation object for a language.
   * Falls back to English if language is not supported.
   */
  private getTranslationsForLanguage(language: LanguageCode): TranslationSchema {
    return getTranslations(language);
  }

  /**
   * Get field label by field key.
   * Reads from global translations: gdpr.fields.<fieldKey>.label
   *
   * @param fieldKey - Field key (e.g., "displayName")
   * @param language - Desired language code
   * @returns Localized field label
   */
  getFieldLabel(fieldKey: string, language: LanguageCode): string {
    const t = this.getTranslationsForLanguage(language);
    const field = t.gdpr.fields[fieldKey as keyof typeof t.gdpr.fields];
    if (field && 'label' in field) {
      return field.label;
    }
    this.logger.warn(`[Localization] Missing field label for "${fieldKey}"`);
    return fieldKey;
  }

  /**
   * Get field explanation by field key.
   * Reads from global translations: gdpr.fields.<fieldKey>.explanation
   *
   * @param fieldKey - Field key (e.g., "displayName")
   * @param language - Desired language code
   * @returns Localized field explanation
   */
  getFieldExplanation(fieldKey: string, language: LanguageCode): string {
    const t = this.getTranslationsForLanguage(language);
    const field = t.gdpr.fields[fieldKey as keyof typeof t.gdpr.fields];
    if (field && 'explanation' in field) {
      return field.explanation;
    }
    this.logger.warn(`[Localization] Missing field explanation for "${fieldKey}"`);
    return '';
  }

  /**
   * Get section title by section ID.
   * Reads from global translations: gdpr.sections.<sectionId>.title
   *
   * @param sectionId - Section ID (e.g., "profile")
   * @param language - Desired language code
   * @returns Localized section title
   */
  getSectionTitle(sectionId: string, language: LanguageCode): string {
    const t = this.getTranslationsForLanguage(language);
    const section = t.gdpr.sections[sectionId as keyof typeof t.gdpr.sections];
    if (section && 'title' in section) {
      return section.title;
    }
    this.logger.warn(`[Localization] Missing section title for "${sectionId}"`);
    return sectionId;
  }

  /**
   * Get section description by section ID.
   * Reads from global translations: gdpr.sections.<sectionId>.description
   *
   * @param sectionId - Section ID (e.g., "profile")
   * @param language - Desired language code
   * @returns Localized section description
   */
  getSectionDescription(sectionId: string, language: LanguageCode): string {
    const t = this.getTranslationsForLanguage(language);
    const section = t.gdpr.sections[sectionId as keyof typeof t.gdpr.sections];
    if (section && 'description' in section) {
      return section.description;
    }
    this.logger.warn(`[Localization] Missing section description for "${sectionId}"`);
    return '';
  }

  /**
   * Get section summary with variable interpolation.
   * Reads from global translations: gdpr.sections.<sectionId>.summaryTemplate
   *
   * @param sectionId - Section ID (e.g., "notifications")
   * @param language - Desired language code
   * @param variables - Placeholder values
   * @returns Localized section summary with substituted placeholders
   */
  getSectionSummary(
    sectionId: string,
    language: LanguageCode,
    variables: Record<string, string | number>,
  ): string {
    const t = this.getTranslationsForLanguage(language);
    const section = t.gdpr.sections[sectionId as keyof typeof t.gdpr.sections];
    if (section && 'summaryTemplate' in section) {
      return interpolate(section.summaryTemplate, variables);
    }
    return '';
  }

  /**
   * Get document text (title, footer, etc.).
   * Reads from global translations: gdpr.document.<key>
   *
   * @param key - Document key (e.g., "title", "generated")
   * @param language - Desired language code
   * @returns Localized document text
   */
  getDocumentText(key: string, language: LanguageCode): string {
    const t = this.getTranslationsForLanguage(language);
    const value = t.gdpr.document[key as keyof typeof t.gdpr.document];
    if (typeof value === 'string') {
      return value;
    }
    // Handle nested footer object
    if (key.startsWith('footer.')) {
      const footerKey = key.substring(7) as keyof typeof t.gdpr.document.footer;
      return t.gdpr.document.footer[footerKey] ?? key;
    }
    this.logger.warn(`[Localization] Missing document text for "${key}"`);
    return key;
  }

  /**
   * Get branding text.
   * Reads from global translations: branding.<key>
   *
   * @param key - Branding key (e.g., "companyName")
   * @param language - Desired language code
   * @returns Localized branding text
   */
  getBrandingText(key: string, language: LanguageCode): string {
    const t = this.getTranslationsForLanguage(language);
    return t.branding[key as keyof typeof t.branding] ?? key;
  }

  /**
   * Format a boolean value to localized text.
   *
   * @param value - Boolean value
   * @param language - Desired language code
   * @returns Localized "Yes" or "No"
   */
  formatBoolean(value: boolean, language: LanguageCode): string {
    const t = this.getTranslationsForLanguage(language);
    return value ? t.common.yes : t.common.no;
  }

  /**
   * Format a nullable value to localized text.
   *
   * @param value - Value (may be null/undefined)
   * @param language - Desired language code
   * @returns Value as string or localized "N/A"
   */
  formatNullable(value: unknown, language: LanguageCode): string {
    if (value === null || value === undefined) {
      const t = this.getTranslationsForLanguage(language);
      return t.common.notAvailable;
    }
    return String(value);
  }

  /**
   * Check if a language is supported.
   *
   * @param language - Language code to check
   * @returns True if supported, false otherwise
   */
  isLanguageSupported(language: LanguageCode): boolean {
    return isLanguageSupported(language);
  }

  /**
   * Get all supported language codes.
   *
   * @returns Array of supported language codes
   */
  getSupportedLanguages(): LanguageCode[] {
    return [...SUPPORTED_LANGUAGES] as LanguageCode[];
  }

  /**
   * Get the default fallback language.
   *
   * @returns Default language code
   */
  getDefaultLanguage(): LanguageCode {
    return DEFAULT_LANGUAGE;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Generic Key-Based Text Lookups (Backward Compatibility)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get text by dot-notation key.
   * Supports keys like:
   * - 'common.none' → t.common.none
   * - 'document.title' → t.gdpr.document.title
   * - 'document.footer.gdprNotice' → t.gdpr.document.footer.gdprNotice
   * - 'section.notifications.summary' → t.gdpr.sections.notifications.summaryTemplate
   *
   * @param key - Dot-notation key
   * @param language - Desired language code
   * @returns Localized text or key as fallback
   */
  getText(key: string, language: LanguageCode): string {
    const t = this.getTranslationsForLanguage(language);

    // Handle common.* keys
    if (key.startsWith('common.')) {
      const commonKey = key.substring(7) as keyof typeof t.common;
      if (t.common[commonKey] !== undefined) {
        return t.common[commonKey];
      }
    }

    // Handle document.* keys (maps to gdpr.document.*)
    if (key.startsWith('document.')) {
      const docKey = key.substring(9); // Remove 'document.'

      // Handle nested footer keys: document.footer.X → gdpr.document.footer.X
      if (docKey.startsWith('footer.')) {
        const footerKey = docKey.substring(7) as keyof typeof t.gdpr.document.footer;
        if (t.gdpr.document.footer[footerKey] !== undefined) {
          return t.gdpr.document.footer[footerKey];
        }
      }

      // Handle direct document keys: document.X → gdpr.document.X
      const directKey = docKey as keyof typeof t.gdpr.document;
      const value = t.gdpr.document[directKey];
      if (typeof value === 'string') {
        return value;
      }
    }

    this.logger.warn(`[Localization] Missing text for key "${key}"`);
    return key;
  }

  /**
   * Get text by dot-notation key with variable interpolation.
   * Supports keys like:
   * - 'section.notifications.summary' → gdpr.sections.notifications.summaryTemplate
   * - 'section.preferences.summary' → gdpr.sections.preferences.summaryTemplate
   *
   * @param key - Dot-notation key (with .summary suffix for section summaries)
   * @param language - Desired language code
   * @param variables - Placeholder values for interpolation
   * @returns Localized text with substituted placeholders
   */
  getTextWithVariables(
    key: string,
    language: LanguageCode,
    variables: Record<string, string | number>,
  ): string {
    const t = this.getTranslationsForLanguage(language);

    // Handle section.*.summary keys → gdpr.sections.*.summaryTemplate
    if (key.startsWith('section.') && key.endsWith('.summary')) {
      const sectionId = key.slice(8, -8); // Extract section ID between 'section.' and '.summary'
      const section = t.gdpr.sections[sectionId as keyof typeof t.gdpr.sections];
      if (section && 'summaryTemplate' in section) {
        return interpolate(section.summaryTemplate, variables);
      }
    }

    // Fallback: try to get text and interpolate
    const text = this.getText(key, language);
    return interpolate(text, variables);
  }
}
