// Notifications Module Exports
export { NotificationsModule } from './notifications.module';
export { NotificationsService } from './notifications.service';
export { NotificationsCronService } from './notifications-cron.service';
export { NotificationsRepository } from './notifications.repository';
export { NotificationDeliveryService } from './notification-delivery.service';

// Notification Profile Service
export { NotificationProfileService } from './notification-profile.service';

// Phase 7: Notification Audit
export {
  NotificationAuditService,
  NotificationEventType,
  NotificationAuditResult,
} from './notification-audit.service';

// Phase 8: Global Notification Orchestrator
export {
  GlobalNotificationService,
  NotificationEvent,
  NotifyUserRequest,
  NotifyUserResult,
} from './global-notification.service';

// Controllers (v1)
export { NotificationsController } from './v1/notifications.controller';
export { NotificationChannelsController } from './v1/notification-channels.controller';

export {
  NotificationResponseDto,
  UnreadExistsResponseDto,
  MarkAllReadResponseDto,
  // Notification Channel DTOs
  UpsertEmailChannelDto,
  SetEmailEnabledDto,
  UpdateNotificationProfileDto,
  NotificationProfileResponseDto,
  EmailChannelResponseDto,
  NotificationProfileWithChannelsResponseDto,
} from './v1/dto';

// Domain
export {
  NotificationCategory,
  UserState,
  DeliveryEligibilityResult,
  isDeliveryAllowed,
} from './domain';

// Adapters
export {
  NotificationPayload,
  EmailPayload,
  PushPayload,
  DeliveryResult,
  EmailAdapter,
  PushAdapter,
  EMAIL_ADAPTER,
  PUSH_ADAPTER,
  StubEmailAdapter,
  StubPushAdapter,
  ExpoPushAdapter,
} from './adapters';

// Types
export {
  // Re-exported Prisma types
  NotificationLog,
  ScheduledNotification,
  ScheduledNotificationStatus,
  // Input types
  CreateImmediateNotificationInput,
  CreateScheduledNotificationInput,
  // Query types
  NotificationLogFilters,
  PaginationOptions,
  // Cron types
  NotificationCronResult,
  ScheduledNotificationExecutionResult,
  // Delivery hook interface
  NotificationDeliveryHook,
  NOTIFICATION_DELIVERY_HOOKS,
} from './notifications.types';
