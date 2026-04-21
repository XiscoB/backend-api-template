import { Injectable, Logger } from '@nestjs/common';
import { NotificationDeliveryHook, EmailPayload } from '../notifications.types';
import { NotificationLog } from '@prisma/client';
import { NotificationDeliveryService } from '../notification-delivery.service';
import { NotificationCategory } from '../domain';
import { NotificationProfileService } from '../notification-profile.service';

@Injectable()
export class EmailDeliveryHook implements NotificationDeliveryHook {
  private readonly logger = new Logger(EmailDeliveryHook.name);

  constructor(
    private readonly deliveryService: NotificationDeliveryService,
    private readonly profileService: NotificationProfileService,
  ) {}

  async onNotificationCreated(notification: NotificationLog): Promise<void> {
    const { identityId, type, payload } = notification;

    // 1. Circuit Breaker (Env Var)
    const isEnabled = process.env.NOTIFICATIONS_EMAIL_ENABLED === 'true';

    if (!isEnabled) {
      return;
    }

    // 2. Fetch Profile & Channels
    const profile = await this.profileService.getProfileWithChannels(identityId);
    if (!profile) {
      return;
    }

    const { emailChannels } = profile;

    // Type assertion for payload to match EmailPayload interface
    const typedPayload = JSON.parse(JSON.stringify(payload)) as EmailPayload;

    // 4. Iterate Channels
    for (const channel of emailChannels) {
      if (!channel.enabled) {
        continue;
      }

      try {
        await this.deliveryService.sendEmail(
          channel.email,
          typedPayload,
          NotificationCategory.SYSTEM, // Safe default
          {
            identityId,
            notificationProfileId: channel.notificationProfileId,
            eventType: type,
          },
        );
      } catch (err: unknown) {
        // Logging handled by deliveryService, but we catch to ensure loop continues
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to trigger email delivery for channel ${channel.id}: ${errMsg}`);
      }
    }
  }
}
