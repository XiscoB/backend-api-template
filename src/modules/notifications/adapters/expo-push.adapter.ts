/**
 * Expo Push Adapter (Reference Implementation)
 *
 * A minimal, example implementation of the PushAdapter interface.
 *
 * CONSTRAINTS:
 * - Must NOT perform validation (regex, token checks)
 * - Must NOT manage state (invalidation, removal)
 * - Must NOT loop or retry
 * - Must NOT batch
 * - Must strictly respect NOTIFICATIONS_PUSH_ENABLED
 */

import { Injectable, Logger } from '@nestjs/common';
import { PushAdapter, PushPayload, DeliveryResult } from './adapter.types';
import { AppConfigService } from '../../../config/app-config.service';

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data: ExpoPushTicket[];
}

interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  categoryId?: string;
  priority?: 'default' | 'normal' | 'high';
}

@Injectable()
export class ExpoPushAdapter implements PushAdapter {
  private readonly logger = new Logger(ExpoPushAdapter.name);
  private readonly EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

  constructor(private readonly config: AppConfigService) {}

  /**
   * Send a push notification to a specific device.
   *
   * STRICT BEHAVIOR:
   * 1. Check circuit breaker -> SKIPPED
   * 2. Send over HTTP -> SENT or FAILED
   * 3. No retries, no smart logic.
   */
  async send(token: string, payload: PushPayload): Promise<DeliveryResult> {
    // 1. Circuit Breaker
    if (!this.config.notificationsPushEnabled) {
      return {
        target: token,
        status: 'SKIPPED',
        error: 'Push disabled by env (NOTIFICATIONS_PUSH_ENABLED=false)',
      };
    }

    // 2. Map Payload (No validation)
    const message: ExpoPushMessage = {
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: payload.sound === 'default' ? 'default' : null,
      badge: payload.badge,
      categoryId: payload.categoryId,
      priority: 'high',
    };

    try {
      // 3. Send (Fire and Forget)
      const response = await fetch(this.EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([message]), // Expo requires an array
      });

      if (!response.ok) {
        throw new Error(`Expo API returned ${response.status}: ${response.statusText}`);
      }

      const rawData = (await response.json()) as ExpoPushResponse;
      const ticket = rawData.data?.[0];

      if (ticket?.status === 'ok') {
        return {
          target: token,
          status: 'SENT',
        };
      }

      // 4. Map Provider Rejection
      // We do not parse the error code. It is just a string for the log.
      const errorMsg = ticket?.details?.error ?? ticket?.message ?? 'Unknown Expo Error';

      return {
        target: token,
        status: 'FAILED',
        error: errorMsg,
      };
    } catch (error) {
      // 5. Network/Infra Failure
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Expo push failed: ${errorMessage}`);

      return {
        target: token,
        status: 'FAILED',
        error: errorMessage,
      };
    }
  }
}
