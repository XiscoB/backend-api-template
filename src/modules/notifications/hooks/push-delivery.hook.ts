import { Injectable } from '@nestjs/common';
import {
  NotificationDeliveryHook,
  NotificationChannelType,
  NotificationDeliveryStatus,
  NotificationPayload,
} from '../notifications.types';
import { NotificationLog } from '@prisma/client';
import { NotificationDeliveryService } from '../notification-delivery.service';
import { NotificationAuditService } from '../notification-audit.service';
import { NotificationCategory } from '../domain';

@Injectable()
export class PushDeliveryHook implements NotificationDeliveryHook {
  constructor(
    private readonly deliveryService: NotificationDeliveryService,
    private readonly auditService: NotificationAuditService,
  ) {}

  async onNotificationCreated(notification: NotificationLog): Promise<void> {
    const { identityId, type, payload } = notification;

    // 1. Circuit Breaker (Env Var)
    // Default to false (safe-by-default)
    const isEnabled = process.env.NOTIFICATIONS_PUSH_ENABLED === 'true';

    if (!isEnabled) {
      await this.auditService.logDelivery({
        identityId,
        channelType: NotificationChannelType.PUSH,
        status: NotificationDeliveryStatus.SKIPPED,
        reason: 'Channel disabled by env',
        eventType: type,
        notificationProfileId: null,
      });
      return;
    }

    // 2. Resolve Eligibility
    const category = NotificationCategory.SYSTEM; // Default assumption

    const eligibility = await this.deliveryService.resolveDeliveryEligibility(identityId, category);

    if (!eligibility.allowed) {
      await this.auditService.logDelivery({
        identityId,
        channelType: NotificationChannelType.PUSH,
        status: NotificationDeliveryStatus.SKIPPED,
        reason: eligibility.reason,
        eventType: type,
        notificationProfileId: null,
      });
      return;
    }

    // 3. Load Channels
    const { pushChannels } = await this.deliveryService.getUserChannels(identityId);

    if (pushChannels.length === 0) {
      await this.auditService.logDelivery({
        identityId,
        channelType: NotificationChannelType.PUSH,
        status: NotificationDeliveryStatus.SKIPPED,
        reason: 'No push channels configured',
        eventType: type,
        notificationProfileId: null,
      });
      return;
    }

    // 4. Delivery Loop
    let deliveryAttempted = false;

    // Type assertion for payload to match NotificationPayload interface
    // Type assertion for payload to match NotificationPayload interface
    const typedPayload = JSON.parse(JSON.stringify(payload)) as NotificationPayload;

    for (const channel of pushChannels) {
      if (!channel.isActive) {
        continue;
      }

      deliveryAttempted = true;

      const result = await this.deliveryService.sendPush(channel.expoToken, typedPayload);

      await this.auditService.logDelivery({
        identityId,
        channelType: NotificationChannelType.PUSH,
        status:
          result.status === 'SENT'
            ? NotificationDeliveryStatus.SENT
            : NotificationDeliveryStatus.FAILED,
        reason: result.error,
        eventType: type,
        target: channel.expoToken, // Opaque token log
        notificationProfileId: channel.notificationProfileId,
        meta: result.status === 'SENT' ? undefined : { error: result.error },
      });
    }

    if (!deliveryAttempted) {
      await this.auditService.logDelivery({
        identityId,
        channelType: NotificationChannelType.PUSH,
        status: NotificationDeliveryStatus.SKIPPED,
        reason: 'All push channels inactive',
        eventType: type,
        notificationProfileId: pushChannels[0]?.notificationProfileId,
      });
    }
  }
}
