import { Injectable, Logger } from '@nestjs/common';
import { EmailAdapter } from '../types/email-adapter.interface';
import { RenderedEmail, AdapterSendResult } from '../types/email.types';
import { EmailConfigService } from '../config/email-config.service';

/**
 * SparkPost Transmissions API response shape.
 * @see https://developers.sparkpost.com/api/transmissions/
 */
interface SparkPostResponse {
  results?: {
    id?: string;
    total_accepted_recipients?: number;
    total_rejected_recipients?: number;
  };
  errors?: Array<{ message?: string; code?: string }>;
}

/**
 * Type guard for SparkPost response.
 */
function isSparkPostResponse(data: unknown): data is SparkPostResponse {
  return typeof data === 'object' && data !== null;
}

/**
 * SparkPost email adapter.
 *
 * Implements email delivery via SparkPost Transmissions API.
 * Acts as a "dumb pipe" - receives fully rendered emails and delivers them.
 *
 * SparkPost API Reference:
 * https://developers.sparkpost.com/api/transmissions/
 *
 * Design principles:
 * - No template logic (content is pre-rendered)
 * - Minimal configuration
 * - Structured error handling
 * - Provider-agnostic interface
 */
@Injectable()
export class SparkPostAdapter implements EmailAdapter {
  private readonly logger = new Logger(SparkPostAdapter.name);

  readonly name = 'sparkpost';

  /**
   * SparkPost API endpoint.
   * EU accounts use: https://api.eu.sparkpost.com/api/v1
   * US accounts use: https://api.sparkpost.com/api/v1
   */
  private readonly apiEndpoint: string;

  /**
   * SparkPost API key.
   */
  private readonly apiKey: string;

  constructor(private readonly config: EmailConfigService) {
    this.apiKey = this.config.sparkpostApiKey;
    this.apiEndpoint = this.config.sparkpostApiEndpoint;
  }

  /**
   * Send a single rendered email via SparkPost.
   */
  async send(email: RenderedEmail): Promise<AdapterSendResult> {
    const payload = this.buildTransmissionPayload(email);

    try {
      const response = await this.callApi('/transmissions', payload);

      if (response.ok) {
        const data: unknown = await response.json();
        const sparkPostResponse = isSparkPostResponse(data) ? data : {};
        return {
          accepted: true,
          messageId: sparkPostResponse.results?.id,
          rawResponse: data,
        };
      }

      const errorData: unknown = await response.json().catch(() => ({}));
      const errorMessage = this.extractErrorMessage(errorData);

      this.logger.warn(`SparkPost send failed: ${errorMessage}`, {
        to: email.to,
        status: response.status,
        error: errorData,
      });

      return {
        accepted: false,
        error: errorMessage,
        rawResponse: errorData,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`SparkPost request failed: ${message}`, { to: email.to });

      return {
        accepted: false,
        error: message,
      };
    }
  }

  /**
   * Send multiple emails in batch.
   *
   * SparkPost supports batch sending via a single transmission with
   * multiple recipients. This is more efficient than individual sends.
   */
  async sendBatch(emails: RenderedEmail[]): Promise<AdapterSendResult[]> {
    if (emails.length === 0) {
      return [];
    }

    // For truly batched emails (same content, multiple recipients),
    // SparkPost can send in a single API call.
    // For different content, we must send individually.
    // This implementation sends individually for simplicity.
    // Override this method if batch optimization is needed.

    const results: AdapterSendResult[] = [];

    for (const email of emails) {
      const result = await this.send(email);
      results.push(result);
    }

    return results;
  }

  /**
   * Build SparkPost transmission payload.
   */
  private buildTransmissionPayload(email: RenderedEmail): Record<string, unknown> {
    const fromAddress = email.fromName
      ? { email: email.from, name: email.fromName }
      : { email: email.from };

    const toAddress = email.toName ? { email: email.to, name: email.toName } : { email: email.to };

    const payload: Record<string, unknown> = {
      recipients: [
        {
          address: toAddress,
        },
      ],
      content: {
        from: fromAddress,
        subject: email.subject,
        html: email.html,
        ...(email.text && { text: email.text }),
        ...(email.replyTo && { reply_to: email.replyTo }),
      },
    };

    // Add metadata if present
    if (email.metadata && Object.keys(email.metadata).length > 0) {
      payload.metadata = email.metadata;
    }

    return payload;
  }

  /**
   * Call SparkPost API.
   */
  private async callApi(path: string, payload: Record<string, unknown>): Promise<Response> {
    const url = `${this.apiEndpoint}${path}`;

    return await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Extract a human-readable error message from SparkPost error response.
   */
  private extractErrorMessage(errorData: unknown): string {
    // SparkPost error format:
    // { errors: [{ message: "...", code: "...", description: "..." }] }
    if (
      typeof errorData === 'object' &&
      errorData !== null &&
      'errors' in errorData &&
      Array.isArray((errorData as { errors: unknown[] }).errors)
    ) {
      const errors = (errorData as { errors: unknown[] }).errors;
      if (errors.length > 0) {
        const firstError = errors[0];
        if (typeof firstError === 'object' && firstError !== null) {
          const err = firstError as Record<string, unknown>;
          if (typeof err.description === 'string') return err.description;
          if (typeof err.message === 'string') return err.message;
        }
      }
    }

    return 'SparkPost API error';
  }
}
