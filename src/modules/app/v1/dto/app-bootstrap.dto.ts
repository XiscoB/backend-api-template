/**
 * Public Bootstrap DTOs
 *
 * Defines the public contract for the GET /api/v1/public/bootstrap endpoint.
 *
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                          CONTRACT DEFINITION                                   ║
 * ║                                                                               ║
 * ║   This DTO is a CONTRACT, not a convenience.                                  ║
 * ║   If the frontend breaks, it's because this contract changed.                 ║
 * ║   Changes must be explicit, reviewed, and intentional.                        ║
 * ║                                                                               ║
 * ║   RULES:                                                                      ║
 * ║   - No Prisma models                                                          ║
 * ║   - No auth / JWT data                                                        ║
 * ║   - No per-user data                                                          ║
 * ║   - No environment secrets                                                    ║
 * ║   - No business-domain logic                                                  ║
 * ║   - No dynamic DB-backed flags                                                ║
 * ║   - No GDPR internals, batch sizes, scheduler config                          ║
 * ║   - EN must always be a valid fallback language                               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 *
 * @see src/config/app.constants.ts - Internal source of truth (NOT exposed wholesale)
 */

// ═══════════════════════════════════════════════════════════════════════════════
// Platform Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Supported client platforms.
 */
export type Platform = 'ios' | 'android' | 'web';

// ═══════════════════════════════════════════════════════════════════════════════
// Update Policy DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Localized update message for a specific language.
 *
 * Used to explain why an update is required/recommended.
 */
export interface UpdateMessageDto {
  /** Language code (e.g., 'en', 'es') */
  language: string;

  /** Localized title (e.g., "Update Required") */
  title: string;

  /** Localized body explaining the update */
  body: string;
}

/**
 * Update policy for a specific platform.
 *
 * Defines version requirements and update behavior.
 *
 * Client Evaluation Logic:
 * 1. Compare client version against minimumVersion
 * 2. If client < minimumVersion AND forceUpdate=true → Block app, show update screen
 * 3. If client < minimumVersion AND forceUpdate=false → Show dismissible banner
 * 4. If client >= minimumVersion → Proceed normally
 *
 * @example
 * // Force update scenario (security patch)
 * { minimumVersion: "1.2.0", forceUpdate: true, messages: [...] }
 *
 * // Soft update scenario (new features)
 * { minimumVersion: "1.1.0", forceUpdate: false, messages: [...] }
 */
export interface PlatformUpdatePolicyDto {
  /**
   * Minimum supported version for this platform.
   * Semantic version string (e.g., "1.2.0").
   */
  minimumVersion: string;

  /**
   * Whether the update is mandatory.
   *
   * true = Block app until updated (security/breaking changes)
   * false = Show dismissible warning (new features/improvements)
   */
  forceUpdate: boolean;

  /**
   * Localized messages explaining the update.
   * Client should select based on user's language preference.
   * EN is always included as fallback.
   */
  messages: UpdateMessageDto[];
}

/**
 * Update policies for all platforms.
 *
 * Each platform has independent versioning and update behavior.
 */
export interface UpdatePolicyDto {
  /** iOS app update policy */
  ios: PlatformUpdatePolicyDto;

  /** Android app update policy */
  android: PlatformUpdatePolicyDto;

  /**
   * Web app update policy.
   * Note: Web typically auto-updates, but this enables controlled rollouts.
   */
  web: PlatformUpdatePolicyDto;
}

// ═══════════════════════════════════════════════════════════════════════════════
// App Metadata DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Branding information for client UI.
 *
 * Contains only what the client needs for display.
 * No internal paths or server-side details.
 */
export interface BrandingDto {
  /** Company/app name for display */
  companyName: string;

  /** Support email for user contact */
  supportEmail: string;
}

/**
 * App metadata for client initialization.
 *
 * Contains version and branding information needed at startup.
 */
export interface AppMetadataDto {
  /**
   * Current backend API version.
   * Client can use this to detect version mismatches.
   */
  apiVersion: string;

  /**
   * Current policies version (Terms of Service, Privacy Policy).
   * Client should prompt re-acceptance if this changes.
   */
  policiesVersion: string;

  /** Branding information for UI */
  branding: BrandingDto;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Flags DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Feature flags for client-side feature toggling.
 *
 * RULES:
 * - Explicit booleans only (no inferred behavior)
 * - No frontend overrides allowed
 * - Server is the source of truth
 *
 * CLIENT USAGE:
 * - Hide/show UI elements based on flags
 * - Disable features that are turned off server-side
 * - Do NOT cache these values long-term
 */
export interface FeatureFlagsDto {
  /**
   * Premium features enabled.
   * Controls visibility of premium-only UI elements.
   */
  premiumEnabled: boolean;

  /**
   * Push notifications enabled.
   * If false, hide push notification settings in UI.
   */
  pushNotificationsEnabled: boolean;

  /**
   * Email notifications enabled.
   * If false, hide email notification settings in UI.
   */
  emailNotificationsEnabled: boolean;

  /**
   * GDPR data export enabled.
   * If false, hide "Download My Data" option.
   */
  dataExportEnabled: boolean;

  /**
   * Account suspension (reversible deletion) enabled.
   * If false, only show permanent deletion option.
   */
  accountSuspensionEnabled: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internationalization DTOs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Internationalization settings.
 *
 * Informs the client about supported languages.
 */
export interface I18nDto {
  /**
   * Default language code.
   * Client should use this if user hasn't set a preference.
   */
  defaultLanguage: string;

  /**
   * List of supported language codes.
   * Client should only offer these in language selector.
   */
  supportedLanguages: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Bootstrap Response DTO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Public Bootstrap Response DTO
 *
 * The complete contract for public client initialization.
 * Returned by GET /api/v1/public/bootstrap
 *
 * SECTIONS:
 *
 * 1. updatePolicy - Version requirements and forced update logic
 *    → Evaluated immediately on app launch
 *    → Can block the app if forceUpdate=true and version is outdated
 *
 * 2. metadata - App version and branding info
 *    → Used for display and version tracking
 *    → policiesVersion triggers ToS/Privacy re-acceptance flow
 *
 * 3. features - Feature flags for UI toggling
 *    → Controls visibility of features
 *    → Server is source of truth, no client overrides
 *
 * 4. i18n - Language configuration
 *    → Used to initialize locale
 *    → Restricts language selector options
 *
 * CACHING:
 * - Client may cache for up to 1 hour
 * - Must refresh on app foreground after background
 * - Must refresh on app launch
 *
 * @example Response
 * ```json
 * {
 *   "updatePolicy": {
 *     "ios": {
 *       "minimumVersion": "1.0.0",
 *       "forceUpdate": false,
 *       "messages": [
 *         { "language": "en", "title": "Update Available", "body": "..." }
 *       ]
 *     },
 *     "android": { ... },
 *     "web": { ... }
 *   },
 *   "metadata": {
 *     "apiVersion": "0.1.0",
 *     "policiesVersion": "1.0.0",
 *     "branding": { "companyName": "MyApp", "supportEmail": "..." }
 *   },
 *   "features": {
 *     "premiumEnabled": false,
 *     "pushNotificationsEnabled": true,
 *     "emailNotificationsEnabled": true,
 *     "dataExportEnabled": true,
 *     "accountSuspensionEnabled": true
 *   },
 *   "i18n": {
 *     "defaultLanguage": "en",
 *     "supportedLanguages": ["en", "es"]
 *   }
 * }
 * ```
 */
export interface AppBootstrapResponseDto {
  /**
   * Update policies per platform.
   * Client evaluates based on its platform and version.
   */
  updatePolicy: UpdatePolicyDto;

  /**
   * App metadata (version, branding).
   */
  metadata: AppMetadataDto;

  /**
   * Feature flags for UI toggling.
   */
  features: FeatureFlagsDto;

  /**
   * Internationalization settings.
   */
  i18n: I18nDto;
}
