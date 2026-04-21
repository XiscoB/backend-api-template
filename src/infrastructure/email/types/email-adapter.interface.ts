/**
 * Email Adapter interface.
 *
 * Defines the contract for email delivery providers.
 * Adapters are "dumb pipes" - they receive fully rendered emails
 * and deliver them. No template logic, no business rules.
 *
 * Design principles:
 * - Single method interface (send)
 * - Receives rendered content only
 * - Returns structured results
 * - Provider-agnostic contract
 */

import { RenderedEmail, AdapterSendResult } from './email.types';

/**
 * Email adapter interface.
 *
 * All email providers must implement this interface.
 * The adapter handles the actual delivery to the email provider.
 */
export interface EmailAdapter {
  /**
   * The name of this adapter/provider.
   * Used for logging and result attribution.
   */
  readonly name: string;

  /**
   * Send a rendered email.
   *
   * @param email - Fully rendered email ready for delivery
   * @returns Result of the send operation
   */
  send(email: RenderedEmail): Promise<AdapterSendResult>;

  /**
   * Send multiple rendered emails in batch.
   *
   * Default implementation calls send() for each email.
   * Adapters may override for batch optimization.
   *
   * @param emails - Array of rendered emails
   * @returns Array of results (same order as input)
   */
  sendBatch?(emails: RenderedEmail[]): Promise<AdapterSendResult[]>;
}

/**
 * Injection token for the email adapter.
 */
export const EMAIL_ADAPTER = Symbol('EMAIL_ADAPTER');
