/**
 * GDPR Export Document Model (Phase 3.5)
 *
 * This file defines the **semantic representation** of a GDPR export document.
 *
 * This model is:
 * - Format-agnostic (works for HTML, JSON, PDF, etc.)
 * - Human-centric (designed for user comprehension, not machine parsing)
 * - Language-aware (all user-facing text is localized)
 * - Renderer-independent (no HTML, CSS, or formatting logic)
 *
 * This layer sits BETWEEN:
 * - Phase 3: Data collection (raw database data)
 * - Phase 4: Export packaging (file generation and storage)
 *
 * Purpose:
 * This phase answers: "How should GDPR data be represented for rendering?"
 * It does NOT answer: "How should it be formatted?" or "Where should it be stored?"
 *
 * Mental Model:
 * - Phase 3 collected the truth (raw data)
 * - Phase 3.5 defines how truth is explained to humans (semantic structure)
 * - Phase 4 will decide how it's packaged (HTML/JSON files)
 * - Phase 5 will decide how it's delivered (storage/notifications)
 */

// ═══════════════════════════════════════════════════════════════════════════
// Export Document Model
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Top-level GDPR export document.
 *
 * This is the complete semantic representation of a user's GDPR data export.
 * It contains metadata and an ordered list of sections.
 *
 * Invariants:
 * - Document is deterministic (same input = same output)
 * - Sections are explicitly ordered
 * - All user-facing text is language-aware
 * - No formatting or rendering logic
 */
export interface GdprExportDocument {
  /** Document metadata (when, who, what) */
  metadata: GdprDocumentMetadata;

  /** Ordered sections of the document */
  sections: GdprDocumentSection[];
}

/**
 * Document metadata.
 *
 * Provides context about the export:
 * - When it was generated
 * - For which user
 * - In which language
 * - Schema version (for future compatibility)
 */
export interface GdprDocumentMetadata {
  /** When this document was generated (ISO 8601 timestamp) */
  generatedAt: Date;

  /** Identity ID for whom this export was created */
  identityId: string;

  /**
   * User's preferred language (ISO 639-1 code).
   * Resolved from user profile, NEVER from request headers.
   * Examples: "en", "es", "fr", "de"
   */
  language: string;

  /**
   * Document schema version for future compatibility.
   * Format: semver (e.g., "1.0.0")
   */
  schemaVersion: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Section Model
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A section represents a logical grouping of GDPR data.
 *
 * Each section corresponds to a data domain (e.g., Profile, Notifications).
 *
 * Sections are:
 * - Explicitly declared (no dynamic generation)
 * - Deterministically ordered
 * - Independently renderable
 * - Language-aware
 *
 * Examples:
 * - "Your Profile" section (identity + profile data)
 * - "Notification History" section (notification logs)
 * - "Communication Preferences" section (channels)
 */
export interface GdprDocumentSection {
  /**
   * Stable section identifier.
   * Used for programmatic access and ordering.
   * Never shown to users.
   *
   * Examples: "identity", "profile", "notifications", "preferences"
   */
  id: string;

  /**
   * Human-readable section title.
   * Language-aware (localized based on user's language).
   *
   * Examples:
   * - "Your Identity" (en)
   * - "Tu Identidad" (es)
   */
  title: string;

  /**
   * Optional section description.
   * Provides context about what data is in this section.
   * Language-aware.
   *
   * Example:
   * - "This section contains your core account information." (en)
   */
  description?: string;

  /**
   * Optional section summary.
   * High-level metadata about the section content.
   * Language-aware.
   *
   * Examples:
   * - "Total notifications: 42"
   * - "Channels enabled: Email, Push"
   */
  summary?: string;

  /**
   * Entries in this section.
   * Each entry represents a logical record or data point.
   */
  entries: GdprDocumentEntry[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Entry & Field Model
// ═══════════════════════════════════════════════════════════════════════════

/**
 * An entry represents a single logical record or data point.
 *
 * Examples:
 * - A single notification
 * - User's profile information
 * - A communication channel
 *
 * Each entry contains an ordered list of fields.
 */
export interface GdprDocumentEntry {
  /**
   * Unique identifier for this entry (within its section).
   * Optional - only needed if entries need to be referenced.
   */
  id?: string;

  /**
   * Fields in this entry.
   * Each field represents a key-value pair with optional explanation.
   */
  fields: GdprDocumentField[];
}

/**
 * A field represents a single data point.
 *
 * This directly supports the "Field / Value / Explanation" pattern:
 * - Field: What is this data? (e.g., "Display Name")
 * - Value: The actual value (e.g., "John Doe")
 * - Explanation: Why do we have this? (e.g., "This is the name you chose...")
 *
 * All text is language-aware.
 */
export interface GdprDocumentField {
  /**
   * Stable field key.
   * Used for programmatic access and explanation lookup.
   * Never shown to users directly.
   *
   * Examples: "displayName", "email", "createdAt"
   */
  key: string;

  /**
   * Human-readable field label.
   * Language-aware (localized).
   *
   * Examples:
   * - "Display Name" (en)
   * - "Nombre para Mostrar" (es)
   */
  label: string;

  /**
   * Field value (formatted for human consumption).
   *
   * - Primitives are converted to strings
   * - Dates are formatted (ISO 8601 recommended)
   * - Booleans are converted to "Yes"/"No" (language-aware)
   * - Null/undefined shown as empty string or localized "N/A"
   *
   * Examples:
   * - "John Doe"
   * - "2024-01-15T10:30:00Z"
   * - "Yes"
   */
  value: string;

  /**
   * Optional explanation of why we have this data.
   * Language-aware (localized).
   *
   * This is the GDPR transparency requirement:
   * Users must understand WHY each piece of data exists.
   *
   * Examples:
   * - "This is the display name you chose when creating your profile." (en)
   * - "We store your email to send you important notifications." (en)
   */
  explanation?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Renderer Contract
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Abstract renderer interface.
 *
 * All renderers (HTML, JSON, PDF, etc.) implement this contract.
 *
 * The renderer's job is to:
 * 1. Take a semantic document (GdprExportDocument)
 * 2. Transform it into a specific format
 * 3. Return opaque rendered output
 *
 * This phase does NOT implement renderers - only defines the contract.
 */
export interface GdprExportRenderer<TOutput = unknown> {
  /**
   * Render a GDPR export document into a specific format.
   *
   * @param document - The semantic document to render
   * @returns Rendered output (format-specific)
   *
   * Examples:
   * - HTML renderer returns string of HTML
   * - JSON renderer returns stringified JSON
   * - PDF renderer returns Buffer
   */
  render(document: GdprExportDocument): Promise<TOutput> | TOutput;
}

/**
 * Rendered export result.
 *
 * This is what renderers return.
 * The content is opaque to this layer.
 */
export interface RenderedExport {
  /** MIME type of the rendered content */
  mimeType: string;

  /** Rendered content (format-specific) */
  content: string | Buffer;

  /** Optional suggested filename */
  filename?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Language & Explanation Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Language code (ISO 639-1).
 *
 * Examples: "en", "es", "fr", "de"
 */
export type LanguageCode = string;

/**
 * Localized text lookup key.
 *
 * Used to look up field labels and explanations in language-specific dictionaries.
 *
 * Examples:
 * - "field.displayName.label"
 * - "field.displayName.explanation"
 * - "section.profile.title"
 */
export type LocalizationKey = string;

/**
 * Localized text dictionary.
 *
 * Maps localization keys to translated strings for a specific language.
 *
 * Example structure:
 * ```typescript
 * {
 *   "field.displayName.label": "Display Name",
 *   "field.displayName.explanation": "This is the name you chose...",
 *   "section.profile.title": "Your Profile"
 * }
 * ```
 */
export type LocalizedTextDictionary = Record<LocalizationKey, string>;

/**
 * Multi-language text dictionary.
 *
 * Maps language codes to localized text dictionaries.
 *
 * Example structure:
 * ```typescript
 * {
 *   "en": { "field.displayName.label": "Display Name", ... },
 *   "es": { "field.displayName.label": "Nombre para Mostrar", ... }
 * }
 * ```
 */
export type MultiLanguageTextDictionary = Record<LanguageCode, LocalizedTextDictionary>;

// ═══════════════════════════════════════════════════════════════════════════
// Builder Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Section builder function.
 *
 * Builds a single section from raw collected data.
 *
 * Each data domain has its own builder function:
 * - buildIdentitySection()
 * - buildProfileSection()
 * - buildNotificationsSection()
 * - etc.
 */
export type SectionBuilder<TInput = unknown> = (
  input: TInput,
  language: LanguageCode,
) => GdprDocumentSection | null;

/**
 * Document builder options.
 */
export interface DocumentBuilderOptions {
  /** Language for localized text */
  language: LanguageCode;

  /** Document schema version */
  schemaVersion?: string;

  /** Custom section builders (for extension) */
  customBuilders?: SectionBuilder[];
}
