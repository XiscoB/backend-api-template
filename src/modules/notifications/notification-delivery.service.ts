/**
 * Notification Delivery Service (Shell)
 *
 * Provides granular, low-level helper methods for delivery hooks.
 * This service is NOT a central dispatcher. It is a toolbox for Hooks.
 *
 * Responsibilities:
 * 1. Resolve delivery eligibility (Identity state)
 * 2. Load user's notification channels
 * 3. Wrap adapter calls for specific channels
 *
 * STRICT CONSTRAINTS:
 * - Must NOT perform channel invalidation (side-effects)
 * - Must NOT perform retries
 * - Must NOT implement routing logic
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationCategory } from './domain';
import {
  EmailAdapter,
  PushAdapter,
  NotificationPayload,
  DeliveryResult,
  EMAIL_ADAPTER,
  PUSH_ADAPTER,
} from './adapters';
import { NotificationDeliveryStatus, NotificationChannelType } from './notifications.types';

/**
 * Invariant:
 * - NotificationLog MUST exist before any delivery attempt
 * - NotificationDeliveryLog MUST only be written by NotificationDeliveryService
 * - Scheduler decides eligibility; delivery is unconditional
 */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_ADAPTER) private readonly emailAdapter: EmailAdapter,
    @Inject(PUSH_ADAPTER) private readonly pushAdapter: PushAdapter,
  ) {}

  /**
   * Resolve whether delivery is allowed for the given identity.
   * Checks identity state (suspended, banned, deleted, etc.)
   */
  async resolveDeliveryEligibility(
    identityId: string,
    _category: NotificationCategory,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const identity = await this.prisma.identity.findUnique({
      where: { id: identityId },
      select: {
        isSuspended: true,
        isBanned: true,
        anonymized: true,
        deletedAt: true,
      },
    });

    if (!identity) {
      return { allowed: false, reason: 'Identity not found' };
    }

    if (identity.isSuspended) {
      return { allowed: false, reason: 'Identity is suspended' };
    }

    if (identity.isBanned) {
      return { allowed: false, reason: 'Identity is banned' };
    }

    if (identity.anonymized) {
      return { allowed: false, reason: 'Identity is anonymized' };
    }

    if (identity.deletedAt) {
      return { allowed: false, reason: 'Identity is deleted' };
    }

    return { allowed: true };
  }

  /**
   * Load all notification channels for the given identity.
   * Returns email and push channels from the user's notification profile.
   */
  async getUserChannels(identityId: string): Promise<{
    emailChannels: Array<{
      id: string;
      email: string;
      enabled: boolean;
      notificationProfileId: string;
    }>;
    pushChannels: Array<{
      id: string;
      expoToken: string;
      isActive: boolean;
      platform: string;
      notificationProfileId: string;
    }>;
  }> {
    const profile = await this.prisma.userNotificationProfile.findUnique({
      where: { identityId },
      include: {
        emailChannels: true,
        pushChannels: true,
      },
    });

    if (!profile) {
      return { emailChannels: [], pushChannels: [] };
    }

    return {
      emailChannels: profile.emailChannels,
      pushChannels: profile.pushChannels,
    };
  }

  /**
   * Send a single email via the adapter and record the audit log.
   */
  async sendEmail(
    to: string,
    payload: NotificationPayload,
    category: NotificationCategory,
    meta?: {
      identityId: string;
      notificationProfileId?: string;
      eventType: string;
    },
  ): Promise<DeliveryResult> {
    try {
      const result = await this.emailAdapter.send(to, payload, category);

      // Log success/failure if identity context is provided
      if (meta) {
        await this.prisma.notificationDeliveryLog.create({
          data: {
            identityId: meta.identityId,
            notificationProfileId: meta.notificationProfileId,
            eventType: meta.eventType,
            channelType: NotificationChannelType.EMAIL,
            status: result.status as NotificationDeliveryStatus,
            reason: result.error,
            target: to,
            meta: result.status === 'SENT' ? undefined : { error: result.error },
          },
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send email to ${to}: ${errorMessage}`);

      const result: DeliveryResult = {
        target: to,
        status: 'FAILED',
        error: errorMessage,
      };

      // Log system failure if identity context is provided
      if (meta) {
        await this.prisma.notificationDeliveryLog.create({
          data: {
            identityId: meta.identityId,
            notificationProfileId: meta.notificationProfileId,
            eventType: meta.eventType,
            channelType: NotificationChannelType.EMAIL,
            status: NotificationDeliveryStatus.FAILED,
            reason: errorMessage,
            target: to,
            meta: { error: errorMessage },
          },
        });
      }

      return result;
    }
  }

  /**
   * Send a single push notification via the adapter and record the audit log.
   */
  async sendPush(
    token: string,
    payload: NotificationPayload,
    meta?: {
      identityId: string;
      notificationProfileId?: string;
      eventType: string;
    },
  ): Promise<DeliveryResult> {
    try {
      const result = await this.pushAdapter.send(token, payload);

      // Log success/failure if identity context is provided
      if (meta) {
        await this.prisma.notificationDeliveryLog.create({
          data: {
            identityId: meta.identityId,
            notificationProfileId: meta.notificationProfileId,
            eventType: meta.eventType,
            channelType: NotificationChannelType.PUSH,
            status: result.status as NotificationDeliveryStatus,
            reason: result.error,
            target: token,
            meta: result.status === 'SENT' ? undefined : { error: result.error },
          },
        });
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send push to token: ${errorMessage}`);

      const result: DeliveryResult = {
        target: token,
        status: 'FAILED',
        error: errorMessage,
      };

      // Log system failure if identity context is provided
      if (meta) {
        await this.prisma.notificationDeliveryLog.create({
          data: {
            identityId: meta.identityId,
            notificationProfileId: meta.notificationProfileId,
            eventType: meta.eventType,
            channelType: NotificationChannelType.PUSH,
            status: NotificationDeliveryStatus.FAILED,
            reason: errorMessage,
            target: token,
            meta: { error: errorMessage },
          },
        });
      }

      return result;
    }
  }
}
