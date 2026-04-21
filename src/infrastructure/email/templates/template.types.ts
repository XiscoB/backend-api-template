/**
 * Email template types.
 *
 * Defines the structure of language-based email templates.
 * Templates are stored as JSON files, one per language.
 */

/**
 * A single email template definition.
 *
 * Contains subject and body with placeholder support.
 * Placeholders use double curly braces: {{variableName}}
 */
export interface EmailTemplateDefinition {
  /**
   * Email subject line.
   * Supports placeholders: {{name}}, {{date}}, etc.
   */
  subject: string;

  /**
   * HTML body content.
   * Supports placeholders for variable substitution.
   */
  html: string;

  /**
   * Plain text body content (optional but recommended).
   * Displayed by email clients that don't support HTML.
   */
  text?: string;
}

/**
 * Language file structure.
 *
 * Maps template keys to their definitions.
 * Example:
 * {
 *   "welcome": { subject: "...", html: "...", text: "..." },
 *   "gdpr-export-ready": { subject: "...", html: "...", text: "..." }
 * }
 */
export interface EmailTemplateFile {
  [templateKey: string]: EmailTemplateDefinition;
}

/**
 * Resolved template with rendered content.
 */
export interface ResolvedEmailTemplate {
  /**
   * Rendered subject line.
   */
  subject: string;

  /**
   * Rendered HTML body.
   */
  html: string;

  /**
   * Rendered plain text body.
   */
  text?: string;
}
