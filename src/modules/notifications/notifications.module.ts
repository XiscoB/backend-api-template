import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { AppConfigModule } from '../../config/app-config.module';
import { EmailModule } from '../../infrastructure/email/email.module';
import { DeliveryModule } from '../../infrastructure/delivery';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { NotificationsCronService } from './notifications-cron.service';
import { NotificationsController } from './v1/notifications.controller';
import { NotificationChannelsController } from './v1/notification-channels.controller';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationAuditService } from './notification-audit.service';
import { GlobalNotificationService } from './global-notification.service';
import { NotificationProfileService } from './notification-profile.service';
import { StubEmailAdapter } from './adapters/email.adapter';
import { StubPushAdapter } from './adapters/push.adapter';
import { EMAIL_ADAPTER, PUSH_ADAPTER } from './adapters/adapter.types';
import { EmailNotificationService } from './email-notification.service';
import { AdminEmailHook } from './adapters/admin-email.hook';
import { NotificationDeliveryHook, NOTIFICATION_DELIVERY_HOOKS } from './notifications.types';
import { EmailDeliveryHook } from './hooks/email-delivery.hook';
import { NotificationAlertsService } from './alerts/notification-alerts.service';
import { NotificationAlertsJob } from './alerts/notification-alerts.job';

/**
 * Notifications Module
 * ...
 */
@Module({
  imports: [PrismaModule, IdentityModule, AppConfigModule, EmailModule.forRoot(), DeliveryModule],
  controllers: [NotificationsController, NotificationChannelsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    NotificationsCronService,
    NotificationDeliveryService,
    NotificationAuditService,
    GlobalNotificationService,
    NotificationProfileService,
    EmailNotificationService,
    NotificationAlertsService,
    NotificationAlertsJob,
    // Default stub adapters - replace in product projects
    { provide: EMAIL_ADAPTER, useClass: StubEmailAdapter },
    { provide: PUSH_ADAPTER, useClass: StubPushAdapter },
    AdminEmailHook,
    EmailDeliveryHook,
    {
      provide: NOTIFICATION_DELIVERY_HOOKS,
      useFactory: (
        adminHook: AdminEmailHook,
        emailHook: EmailDeliveryHook,
      ): NotificationDeliveryHook[] => [adminHook, emailHook],
      inject: [AdminEmailHook, EmailDeliveryHook],
    },
  ],
  exports: [
    NotificationsService,
    NotificationsCronService,
    NotificationsRepository,
    NotificationDeliveryService,
    NotificationAuditService,
    GlobalNotificationService,
    NotificationProfileService,
    EmailNotificationService,
    NotificationAlertsService,
    NotificationAlertsJob,
  ],
})
export class NotificationsModule {}
