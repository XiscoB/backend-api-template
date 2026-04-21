/**
 * Email infrastructure types.
 *
 * Provider-agnostic type definitions for email delivery.
 * These types are designed to be reusable across any project
 * that clones this template repository.
 *
 * Design principles:
 * - Single-first, batch-ready
 * - Provider-neutral (no provider-specific concepts)
 * - Language-based content (templates resolved internally)
 */

// ─────────────────────────────────────────────────────────────
// Email Recipient
// ─────────────────────────────────────────────────────────────

/**
 * A single email recipient.
 *
 * Supports per-recipient variable overrides for personalization.
 * The messageId can be used for idempotency or tracking.
 */
export interface EmailRecipient {
  /**
   * Recipient email address.
   */
  email: string;

  /**
   * Optional display name for the recipient.
   */
  name?: string;

  /**
   * Per-recipient variable overrides.
   * These override the base variables for this specific recipient.
   * Useful for personalizing batch emails.
   */
  variables?: Record<string, string>;

  /**
   * Optional idempotency key for this recipient.
   * Can be used to deduplicate sends or for tracking.
   */
  messageId?: string;
}

// ─────────────────────────────────────────────────────────────
// Email Payload
// ─────────────────────────────────────────────────────────────

/**
 * Email payload for sending emails.
 *
 * Designed for single email sends (primary use case) while
 * supporting batch sending without API changes.
 *
 * Two modes are supported:
 * 1. Template mode: Provide `templateKey` to use a locale-based template
 * 2. Raw mode: Provide `rawHtml` + `rawSubject` to send without templates
 *
 * The template key references a language-based template file,
 * NOT a provider-managed template. Templates are resolved internally.
 */
/**
 * Base email payload with common fields.
 */
interface BaseEmailPayload {
  /**
   * Sender email address.
   * Must be a verified address with the email provider.
   */
  from: string;

  /**
   * Optional sender display name.
   */
  fromName?: string;

  /**
   * Array of recipients.
   * For single sends, this will contain one recipient.
   * For batch sends, this can contain multiple recipients.
   */
  recipients: EmailRecipient[];

  /**
   * Optional reply-to address.
   */
  replyTo?: string;

  /**
   * Optional metadata for tracking.
   * This data is not sent to recipients but can be used
   * for internal tracking, logging, or webhook processing.
   */
  metadata?: Record<string, string>;
}

/**
 * Payload for template-based emails.
 */
export interface TemplateEmailPayload extends BaseEmailPayload {
  /**
   * Template key identifying the email template.
   * References a file in the language templates directory.
   */
  templateKey: string;

  /**
   * Locale for template resolution.
   * Format: ISO 639-1 (e.g., 'en', 'de', 'fr')
   */
  locale: string;

  /**
   * Base variables for template rendering.
   * These are applied to all recipients unless overridden.
   */
  variables: Record<string, string>;

  // Disallow raw fields
  rawHtml?: undefined;
  rawSubject?: undefined;
  rawText?: undefined;
}

/**
 * Payload for raw HTML emails.
 */
export interface RawEmailPayload extends BaseEmailPayload {
  /**
   * Raw HTML content for the email body.
   * Use this for edge cases where templates are not suitable.
   */
  rawHtml: string;

  /**
   * Raw subject line.
   */
  rawSubject: string;

  /**
   * Raw plain text content (optional).
   */
  rawText?: string;

  // Optional/ignored fields
  templateKey?: undefined;
  locale?: string;
  variables?: Record<string, string>;
}

/**
 * Email payload for sending emails.
 *
 * Supports two mutually exclusive modes:
 * 1. Template mode: Requires `templateKey`, `locale`, and `variables`
 * 2. Raw mode: Requires `rawHtml` and `rawSubject`. `locale` and `variables` are optional.
 */
export type EmailPayload = TemplateEmailPayload | RawEmailPayload;

// ─────────────────────────────────────────────────────────────
// Email Result
// ─────────────────────────────────────────────────────────────

/**
 * Result of a single recipient send attempt.
 */
export interface EmailRecipientResult {
  /**
   * Recipient email address.
   */
  email: string;

  /**
   * Whether the send was accepted by the provider.
   * Note: This indicates acceptance for delivery, not delivery itself.
   */
  accepted: boolean;

  /**
   * Optional message identifier from the provider.
   * Useful for tracking or debugging.
   */
  messageId?: string;

  /**
   * Optional error message if the send was rejected.
   */
  error?: string;
}

/**
 * Result of an email send operation.
 *
 * Provides visibility into what was accepted and rejected
 * by the email provider.
 */
export interface EmailResult {
  /**
   * The provider that handled the send.
   * Example: 'sparkpost', 'ses', 'console'
   */
  provider: string;

  /**
   * Number of recipients accepted for delivery.
   */
  acceptedCount: number;

  /**
   * Number of recipients rejected.
   */
  rejectedCount: number;

  /**
   * Individual results per recipient (optional).
   * Not all providers return per-recipient results.
   */
  recipientResults?: EmailRecipientResult[];

  /**
   * Optional metadata returned by the provider.
   */
  providerMetadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Rendered Email
// ─────────────────────────────────────────────────────────────

/**
 * A fully rendered email ready for delivery.
 *
 * This is what the adapter receives after template resolution.
 * Adapters never see template keys or raw variables.
 */
export interface RenderedEmail {
  /**
   * Sender email address.
   */
  from: string;

  /**
   * Optional sender display name.
   */
  fromName?: string;

  /**
   * Recipient email address.
   */
  to: string;

  /**
   * Optional recipient display name.
   */
  toName?: string;

  /**
   * Rendered subject line.
   */
  subject: string;

  /**
   * Rendered HTML body.
   */
  html: string;

  /**
   * Rendered plain text body (optional but recommended).
   */
  text?: string;

  /**
   * Optional reply-to address.
   */
  replyTo?: string;

  /**
   * Optional message identifier for idempotency.
   */
  messageId?: string;

  /**
   * Optional metadata for tracking.
   */
  metadata?: Record<string, string>;
}

// ─────────────────────────────────────────────────────────────
// Adapter Result (Internal)
// ─────────────────────────────────────────────────────────────

/**
 * Result from an adapter's send operation.
 */
export interface AdapterSendResult {
  /**
   * Whether the send was accepted by the provider.
   */
  accepted: boolean;

  /**
   * Message identifier from the provider.
   */
  messageId?: string;

  /**
   * Error message if the send failed.
   */
  error?: string;

  /**
   * Raw provider response (for debugging).
   */
  rawResponse?: unknown;
}
