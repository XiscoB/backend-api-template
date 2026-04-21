/**
 * Email Adapter (Stub Implementation)
 *
 * Stub implementation that logs email sends.
 * Replace with real provider integration in product projects.
 *
 * This adapter:
 * - Does NOT know about users
 * - Does NOT know about GDPR or suspension
 * - Does NOT know about delivery rules
 * - ONLY sends payloads to targets
 */

import { Injectable, Logger } from '@nestjs/common';
import { NotificationCategory } from '../domain/notification-category';
import { EmailAdapter, EmailPayload, DeliveryResult } from './adapter.types';

@Injectable()
export class StubEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger(StubEmailAdapter.name);

  /**
   * Send an email (stub - logs only).
   *
   * @param email - Target email address
   * @param payload - Email content
   * @param category - Notification category
   * @returns Delivery result (always success in stub)
   */
  send(
    email: string,
    payload: EmailPayload,
    category: NotificationCategory,
  ): Promise<DeliveryResult> {
    this.logger.log(
      `[STUB] Sending email to: ${email}, category: ${category}, subject: "${payload.title}"`,
    );

    // In a real implementation, this would:
    // 1. Connect to email provider (SendGrid, SES, etc.)
    // 2. Format the email content
    // 3. Send the email
    // 4. Handle errors and retries

    // Stub always succeeds
    return Promise.resolve({
      target: email,
      status: 'SENT',
    });
  }
}
