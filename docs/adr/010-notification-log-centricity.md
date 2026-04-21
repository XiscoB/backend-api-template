# ADR 010: Notification Log Centricity

## Context

Notification systems often start simple (direct API calls to SendGrid) but quickly become unmanageable swamps of "who was sent what and when?". Common pitfalls include:

- **Implicit State**: "If the `sent_at` column is null, we haven't sent it."
- **Mixed Responsibilities**: "The function that calculates the digest also sends the email."
- **Ephemeral History**: "We rely on SendGrid logs to know what happened."

We need a system that remains debuggable and reliable at scale, without introducing complex message queues or distributed transactions.

## Decision

We adopt a **Log-Centric Architecture** where the primary primitive is the `NotificationLog`.

1.  **Two-Table Separation**: We explicitly separate **Intent** (`ScheduledNotification`) from **Record** (`NotificationLog`).
    - _Why_: Allows us to cancel, debounce, or reschedule intents without messy "soft deletes" in a historical table.
    - _Why_: "My Inbox" queries run against a read-optimized Log table, unpolluted by future/cancelled items.

2.  **Cron Ownership**: The Cron Job is the **sole writer** of `NotificationLog`.
    - _Rule_: No other service, API, or manual script is permitted to write to this table.
    - _Why_: Centralizes the "materialization" logic. No random service can "sneak" a notification into the log without scheduling it.
    - _Why_: Enforces a standardized bottleneck for rate limiting and monitoring.

3.  **Delivery as Side-Effect**: Delivery (Email/Push) is a **post-commit hook** triggered by `NotificationLog` creation.
    - _Rule_: Delivery flow MUST be uni-directional (`Log -> Hook`). Hooks MUST NEVER mutate the `NotificationLog`.
    - _Why_: The "Inbox" is the source of truth. If the email fails, the user still sees the notification in the app.
    - _Why_: Decouples the specialized logic of "talking to Apple Push Notification Service" from the core data model.

## Consequences

### Positive

- **Auditability**: We have a perfect, immutable history of every notification ever "generated" for a user.
- **Resilience**: If the email provider is down, the system continues to function. The in-app inbox remains accurate.
- **Simplicity**: The Scheduler is just a "copier". The Log is just "storage". The Delivery is just "a function". No complex state machines.

### Negative

- **Latency**: Notifications are not "instant". They must wait for the next Cron tick (e.g., 1 minute).
  - _Mitigation_: For "urgent" notifications (e.g., Password Reset), we can run the materialization logic immediately _after_ scheduling, but still via the same code path. (Or accept 1-min latency as acceptable for boring infrastructure).
- **Storage**: We store a row for every notification.
  - _Mitigation_: Pruning policies for old logs (handled by separate cleanup jobs).

## Compliance

- **GDPR**: This model simplifies GDPR. The `NotificationLog` is clearly Personal Data and easy to export/delete by `identityId`.
