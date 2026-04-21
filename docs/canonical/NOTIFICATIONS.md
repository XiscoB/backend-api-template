> Documentation Layer: Canonical Contract

# Notification System

The `backend-base` template includes a robust, provider-agnostic notification system designed to handle in-app notifications, emails, and push notifications (future support).

## Architecture Overview

The system is built on a **Log-Centric** architecture. The database is the single source of truth for all notifications.

1.  **Notification Logs**: Every notification (regardless of channel) is persisted as a `NotificationLog` in the database. This allows for a unified "Inbox" view for users.
2.  **Delivery Hooks**: When a `NotificationLog` is created, registered hooks (like sending an email) are triggered asynchronously.
3.  **Scheduled Notifications**: Notifications can be scheduled for future delivery. They are stored as `ScheduledNotification` and converted to `NotificationLog` entries by a cron worker.

### Key Components

- **`NotificationsService`**: The main entry point. Handles creating logs, scheduling, and user queries (unread count, mark as read).
- **`EmailService`**: Handles email template resolution, rendering, and delivery via an adapter.
- **`StubEmailAdapter`**: The default email adapter that logs to the console instead of sending real emails.
- **`AdminEmailHook`**: A specific hook that listens for `ADMIN_REPORTS_DIGEST` events and sends an email to the administrator.

## Data Model

The system uses the following Prisma models (see `prisma/schema.prisma`):

| Model                     | Purpose                                                                                 |
| :------------------------ | :-------------------------------------------------------------------------------------- |
| `NotificationLog`         | The user's notification history. Contains `type`, `payload`, `visibleAt`, and `readAt`. |
| `ScheduledNotification`   | Notifications waiting to be processed at `scheduledAt`.                                 |
| `UserNotificationProfile` | Stores user preferences, language, and global toggle for notifications.                 |
| `UserEmailChannel`        | Manages email addresses and subscription status (transactional/promo).                  |
| `NotificationDeliveryLog` | Audit log of delivery attempts (Sent/Skipped/Failed).                                   |

## Usage

### 1. Sending an Immediate Notification

Use `NotificationsService.notifyNow` (or `notifyByIdentityId` for internal use) to send a notification immediately.

```typescript
// In a controller or service
await this.notificationsService.notifyNow({
  userId: user.id, // External User ID (JWT sub)
  type: 'GDPR_EXPORT_READY', // Semantic type
  payload: {
    downloadUrl: 'https://...',
  },
});
```

This will:

1.  Create a `NotificationLog`.
2.  Invoke any active Delivery Hooks (e.g., send an email if a hook exists for this type).

### 2. Scheduling a Notification

Use `NotificationsService.scheduleNotification` to send a notification in the future.

```typescript
await this.notificationsService.scheduleNotification({
  userId: user.id,
  type: 'TRIAL_EXPIRING_SOON',
  payload: { daysLeft: 3 },
  scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
});
```

The `NotificationsCronService` (triggered by an external cron job) will process this at the scheduled time.

### 3. Checking Notifications

```typescript
// Get unread count
const count = await this.notificationsService.getUnreadCount(userId);

// Get visible notifications
const logs = await this.notificationsService.getNotificationsForUser(userId, {
  isRead: false, // optional filter
});
```

## Email Infrastructure

The `EmailService` is designed to be provider-agnostic.

- **Templates**: It supports both raw HTML and template-based emails (implementation needed for template resolver).
- **Adapters**: It uses the `EmailAdapter` interface.
  - **Current**: `StubEmailAdapter` in `src/modules/notifications/adapters/email.adapter.ts` (Logs to console).
  - **Production**: You should implement a real adapter (e.g., `SendGridAdapter`, `SESAdapter`) implementing `EmailAdapter`.

### Admin Reports Digest

There is a built-in workflow for Admin Reports (see `src/modules/notifications/adapters/admin-email.hook.ts`):

1.  A system job triggers a notification with type `ADMIN_REPORTS_DIGEST`.
2.  The `AdminEmailHook` detects this type.
3.  It formats an HTML email summary.
4.  It sends the email via `EmailService` to the configured `EMAIL_ADMIN_EMAIL`.

## Current Status & Limitations

1.  **Email Stub**: The system is currently using a **Stub Adapter**. No real emails are sent; they are just logged to the application output.
2.  **Push Notifications**: The data model supports `UserPushChannel` and `Expo` tokens, but there is no active `PushNotificationService` or adapter implemented in the current version.
3.  **Templates**: The `EmailTemplateResolver` structure exists, but specific templates need to be defined.

## Extending the System

To add a new notification type with email delivery:

1.  **Define Type**: Choose a string constant (e.g., `WELCOME_NEW_USER`).
2.  **Create Hook**: Create a new `NotificationDeliveryHook` (or update an existing one) to listen for this type.
3.  **Implement Email**: In the hook, call `EmailService.send()` with the desired content.
4.  **Register Hook**: Add the hook to the `NOTIFICATION_DELIVERY_HOOKS` provider in `NotificationsModule`.

