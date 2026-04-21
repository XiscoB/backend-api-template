/**
 * Global Translations Index
 *
 * Single aggregation file for all translations.
 * No i18n framework, no runtime magic, just static TypeScript objects.
 *
 * Usage:
 * ```typescript
 * import { getTranslations, TRANSLATIONS } from '@common/translations';
 *
 * // Get translations for a language (with fallback to English)
 * const t = getTranslations(userLanguage);
 * console.log(t.notifications.gdprExportReady.title);
 *
 * // Or access directly
 * const t = TRANSLATIONS.en;
 * console.log(t.gdpr.document.title);
 * ```
 *
 * To add a new language:
 * 1. Create new file (e.g., fr.ts)
 * 2. Export object matching TranslationSchema
 * 3. Import and add to TRANSLATIONS here
 * 4. Add language code to SupportedLanguage type
 *
 * @see docs/agents.md - Translations are static constants, no i18n system
 */

import { EN, TranslationSchema } from './en';
import { ES } from './es';

/**
 * Supported language codes.
 * Add new languages here when adding translation files.
 */
export type SupportedLanguage = 'en' | 'es';

/**
 * All translations indexed by language code.
 */
export const TRANSLATIONS: Record<SupportedLanguage, TranslationSchema> = {
  en: EN,
  es: ES,
};

/**
 * Default fallback language.
 */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

/**
 * List of all supported languages.
 */
export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = ['en', 'es'] as const;

/**
 * Get translations for a language.
 *
 * If the language is not supported, returns English (default).
 * This function is simple and has no side effects.
 *
 * @param lang - Language code (e.g., 'en', 'es')
 * @returns Translation object for the language
 */
export function getTranslations(lang: string | undefined | null): TranslationSchema {
  if (lang && lang in TRANSLATIONS) {
    return TRANSLATIONS[lang as SupportedLanguage];
  }
  return TRANSLATIONS[DEFAULT_LANGUAGE];
}

/**
 * Check if a language is supported.
 *
 * @param lang - Language code to check
 * @returns True if supported, false otherwise
 */
export function isLanguageSupported(lang: string | undefined | null): lang is SupportedLanguage {
  return typeof lang === 'string' && lang in TRANSLATIONS;
}

/**
 * Replace placeholders in a template string.
 *
 * Placeholders are in the format: {{key}}
 *
 * Example:
 * - Template: "Total notifications: {{count}}"
 * - Variables: { count: 42 }
 * - Result: "Total notifications: 42"
 *
 * @param template - Template string with {{key}} placeholders
 * @param variables - Key-value pairs for substitution
 * @returns String with placeholders replaced
 */
export function interpolate(template: string, variables: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
  }
  return result;
}

// Re-export types for convenience
export type { TranslationSchema };
