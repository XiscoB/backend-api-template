> Documentation Layer: Canonical Contract

# Notification System Architecture

## Overview

The backend-base notification system is a **log-centric, provider-agnostic** pipeline designed for infrastructure reliability rather than engagement optimization. It strictly separates **intent** (scheduling) from **realization** (inbox) and **delivery** (email/push).

This system is "boring" by design. It prioritizes data integrity, auditability, and idempotency over complex features.

## Core Invariants

1.  **Intent != Reality**: Scheduling a notification (`ScheduledNotification`) does not make it real. It is merely a request. Only the Cron job can make it "real" by creating a `NotificationLog`.
2.  **One-Way Pipeline**: Data flows strictly: `Schedule -> Log -> Delivery`. Use cases requiring "read receipts" or "click tracking" flow back via separate analytics pipelines, never mutating the notification history.
3.  **Identity-Centric**: All notifications belong to an `Identity`. There is no concept of emailing an "unregistered email address" or "anonymous user" in this system.
4.  **Provider Agnostic**: The core data model knows nothing about SendGrid, Expo, or specific delivery channels.

## Data Pipeline

### 1. The Intent Layer (`ScheduledNotification`)

- **Role**: A mutable, ephemeral holding area for future notifications.
- **Behavior**: Can be cancelled, debounced, or rescheduled.
- **Persistence**: Rows are deleted or marked processed after execution. They are not historical records.

### 2. The Materializer (Cron Job)

- **Role**: The bridge between Intent and Reality.
- **Behavior**:
  - Periodically queries `PENDING` schedules.
  - Idempotently inserts into `NotificationLog`.
  - NEVER performs delivery (no API calls).
  - NEVER executes business logic.
- **Mechanism**: Uses `FOR UPDATE SKIP LOCKED` for safe, competitive consumption by multiple instances.

### 3. The Reality Layer (`NotificationLog`)

- **Role**: The immutable source of truth for the user's inbox.
- **Behavior**: Once created, it exists forever (until hard deletion/GDPR).
- **Invariant**: If it's in this table, the user "has the notification".

### 4. The Side-Effect Layer (Delivery Hooks)

- **Role**: Observes the creation of `NotificationLog` to trigger external delivery.
- **Behavior**:
  - Fire-and-forget.
  - Checks user preferences (Email/Push enabled?).
  - Handles provider communication.
  - Logs attempts to `NotificationDeliveryLog`.
  - Failures here do NOT roll back the `NotificationLog`.

## Supported Edge Cases

### Urgent Notifications (No Fast Paths)

"Urgent" notifications (e.g., Password Resets) do **NOT** bypass the scheduler.

- **Mechanism**: Schedule with `NOW()` -> Trigger Cron Immediately (optional optimization) -> Materialize.
- **Invariant**: Even if the user is waiting on the screen, the data MUST flow through `ScheduledNotification` -> `NotificationLog`.
- **Why**: Introducing a "direct send" API would fragment the system, break the debouncing guarantee, and bypass the audit trail.

### Delivery Disablement (Valid State)

It is a **valid, healthy state** for the system to run with ALL delivery channels disabled (e.g., via env vars).

- **Inbox Correctness**: `NotificationLog` entries are still generated and visible in the in-app inbox.
- **No Errors**: The `NotificationDeliveryLog` will simply record `SKIPPED` (Reason: "Channel disabled").
- **Use Case**: Local development, staging environments, or "Inbox Only" features.

## "What This System Explicitly Does NOT Do"

To avoid scope creep and maintainability nightmares, this system strictly excludes:

- **No Targeting Logic**: "Send to all active users" is a business query, not a notification system feature. The caller must resolve the list of IDs and schedule them individually.
- **No Campaign Logic**: Concepts like "Drip Campaigns" or "A/B Testing" usually exist in a higher-level marketing service, not this infrastructure.
- **No Retries**: If a delivery hook fails (e.g., SendGrid is down), we log `FAILED` and stop. We do not maintain retry queues in the core system.
- **No Provider Guarantees**: We do not guarantee delivery. We guarantee _intent to deliver_.
- **No Business Rules**: "Don't send if user hasn't paid" is a check performed _before_ calling `schedule()`. The system assumes if you scheduled it, you meant it.
- **No Auth**: This system blindly trusts internal callers. It does not enforce permissions.

