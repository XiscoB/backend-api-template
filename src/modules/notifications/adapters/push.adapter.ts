/**
 * Push Adapter (Stub Implementation)
 *
 * Stub implementation that logs push notification sends.
 * Replace with real provider integration in product projects (e.g., Expo).
 *
 * This adapter:
 * - Does NOT know about users
 * - Does NOT know about GDPR or suspension
 * - Does NOT know about delivery rules
 * - ONLY sends payloads to targets
 */

import { Injectable, Logger } from '@nestjs/common';
import { PushAdapter, PushPayload, DeliveryResult } from './adapter.types';

@Injectable()
export class StubPushAdapter implements PushAdapter {
  private readonly logger = new Logger(StubPushAdapter.name);

  /**
   * Send a push notification (stub - logs only).
   *
   * @param token - Device push token
   * @param payload - Push notification content
   * @param category - Notification category
   * @returns Delivery result (always success in stub)
   */
  send(token: string, payload: PushPayload): Promise<DeliveryResult> {
    // Mask token for logging (show first 10 chars)
    const maskedToken = token.length > 10 ? `${token.substring(0, 10)}...` : token;

    this.logger.log(`[STUB] Sending push to: ${maskedToken}, title: "${payload.title}"`);

    // In a real implementation, this would:
    // 1. Connect to push provider (Expo, FCM, APNs, etc.)
    // 2. Format the push notification
    // 3. Send the notification
    // 4. Handle token invalidation and errors

    // Stub always succeeds
    return Promise.resolve({
      target: token,
      status: 'SENT',
    });
  }
}
