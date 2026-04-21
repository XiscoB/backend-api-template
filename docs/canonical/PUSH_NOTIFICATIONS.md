> Documentation Layer: Canonical Contract

# Push Notifications (Example Implementation)

This document describes the **Push Notification Interface** provided by `backend-base` and documents the **Example Adapter** (Expo) included as a reference implementation.

> [!NOTE]
> **Push Notifications are Infrastructure, not Domain.**
> The core system defines _how to send_ a notification, but the Product Layer defines _who receives it_ and _via which provider_.

## Core Architecture

`backend-base` provides a strict, minimal interface for push notifications. It does **not** assume any specific provider, token structure, or delivery logic.

### 1. The Adapter Interface

All push providers must implement this minimal interface:

```typescript
// src/modules/notifications/adapters/adapter.types.ts
export interface PushAdapter {
  send(token: string, payload: PushPayload): Promise<DeliveryResult>;
}
```

- **token**: The opaque string representing the device target (provider-specific).
- **payload**: The Title/Body/Data to send.
- **DeliveryResult**: `{ status: 'SENT' | 'FAILED' | 'SKIPPED', error?: string }`.
  - **SKIPPED**: Allowed **ONLY** for infrastructure circuit breakers (e.g. `NOTIFICATIONS_PUSH_ENABLED=false`). Never used for business logic or token validation.

### 2. The Delivery Service

The `NotificationDeliveryService` is the **only** permitted caller of the adapter.

- It accepts a raw token and payload.
- It attempts delivery.
- It records the `NotificationDeliveryLog`.
- It **never** retries, debounces, or modifies the payload.

### 3. The Hook (Product Logic)

In your product, you will implement a `DeliveryHook` (e.g., `PushDeliveryHook`) that:

1.  Receives a `NotificationLog` event.
2.  Resolves the user's tokens (from your own database tables).
3.  Calls `NotificationDeliveryService.sendPush()` for each token.
4.  Optionally handles token invalidation if the service returns a specific error.

---

## Example: Expo Push Adapter

The template includes an `ExpoPushAdapter` (`src/modules/notifications/adapters/expo-push.adapter.ts`) to demonstrate how to implement a provider.

**This is an EXAMPLE.** You are expected to replace or modify it for your production needs (FCM, OneSignal, APNS).

### Key Features of Example

- **Single Best-Effort Send**: Attempts to send to one token.
- **Stateless**: Does not track user state or token validity.
- **Infrastructure Circuit Breaker**: Returns `SKIPPED` if `NOTIFICATIONS_PUSH_ENABLED` env var is false.
- **Provider Error Mapping**: Maps provider errors (like `DeviceNotRegistered`) to a simple string in `DeliveryResult`. Does **not** perform cleanup.

### Configuration

```env
NOTIFICATIONS_PUSH_ENABLED=true  # Master switch
```

---

## What `backend-base` Will Never Do

To ensure strict separation of concerns and maintain a clean architecture, the template explicitly **excludes** the following complex behaviors. You must implement these in your Product Layer if needed:

1.  **Token Management**: The template explicitly **removed** `UserPushChannel` tables. You must define your own schema for storing tokens (Device ID, Platform, Token, User FK).
2.  **Retry Logic**: The template does **not** implement a retry queue. If infrastructure fails, it logs `FAILED`. You must implement your own resiliency (e.g., BullMQ) if guaranteed delivery is critical.
3.  **Topic/Group Messaging**: The core interface is 1-to-1 (`send(token)`). Multicast is a product concern.
4.  **Analytics/Tracking**: The template logs _delivery attempts_ (`NotificationDeliveryLog`) but does not track "Opens", "Clicks", or "Conversions".
5.  **Token Cleanup Crons**: The template does not include background jobs to purge old tokens.

## How to Add Push to Your Product

1.  **Create your Schema**: Add a model (e.g., `DeviceToken`) to `schema.prisma`.
2.  **Implement a Hook**: Create `src/modules/notifications/hooks/product-push.hook.ts`.
3.  **Register the Hook**: Add it to `NotificationsModule`.
4.  **Swap the Adapter** (Optional): If not using Expo, implement `PushAdapter` and provide it as `PUSH_ADAPTER`.

