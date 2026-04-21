# ADR 011: Notification Content Immutability

## Context

A common failure mode in notification systems is **Content Drift**.

- _Scenario_: We schedule a "Welcome" email for delayed sending.
- _Change_: We deploy a code change renaming "Welcome" to "Getting Started".
- _Drift_: The scheduled job wakes up, strictly looks for "Welcome", fails to find it, and crashes (or sends nothing).

Conversely, for "Marketing" blasts, the content often comes from a dynamic admin input which might change or disappear before the blast is finished.

## Decision

We enforce **Payload Immutability** at the Infrastructure Layer, with two distinct strategies for handling content resolution.

### 1. The Strategy

We do **NOT** store "Foreign Keys to Content". We store the Content (or the keys to generate it) directly in the `ScheduledNotification` payload.

- **Invariant**: The `ScheduledNotification.payload` MUST be self-contained. It MUST NEVER reference mutable external database rows (e.g., `campaign_id`).
- **Invariant**: Once scheduled, the payload is **frozen**. Updates require cancelling and rescheduling a new notification.

### 2. Resolution Paths

#### Path A: Semantic (Code-Driven)

For system events (e.g., `PASSWORD_RESET`), the payload contains _variables_, not text.

- **Stored**: `{ "type": "password_reset", "payload": { "resetLink": "..." } }`
- **Resolved At**: **Delivery Time**.
- **Why**: We _want_ the user to see the _latest_ copy deployed in the codebase. If we fix a typo in the email template, pending emails MUST use the fix.
- **Constraint**: The `type` MUST exist in the code registry. Deleting a type is a **Breaking Change**.

#### Path B: Custom (Data-Driven)

For one-off blasts (e.g., "Service Outage Update"), the payload contains _the full localized text_.

- **Stored**:
  ```json
  {
    "type": "broadcast_message",
    "payload": {
      "en": { "subject": "We are down" },
      "es": { "subject": "Estamos caídos" }
    }
  }
  ```
- **Resolved At**: **Schedule Time** (Creation).
- **Why**: This content does not exist in the codebase. It is ephemeral. We MUST "freeze" it at the moment of creation.
- **Constraint**: Post-scheduling edits are FORBIDDEN. If the admin wants to change the text, the system MUST cancel the old notification and create a new one.

### 3. Localization

Localization is performed **Downstream** and **Just-In-Time**.

- The `ScheduledNotification` and `NotificationLog` store the _potential_ for all languages (or the keys).
- The **Delivery Hook** resolves the specific User's locale (from their Profile) and renders the final string.
- _Invariant_: The Log Table is locale-agnostic. The Email is locale-specific.
- _Invariant_: A user's locale change MUST NEVER mutate historical logs.

## Anti-Patterns (Violations)

- **NEVER** look up a "Campaign ID" during delivery to find the definition. (What if the campaign was deleted?).
- **NEVER** modify a `ScheduledNotification` payload in place. (Violates immutability/audit trail).
- **NEVER** store specific locale text in `NotificationLog` unless it is a Custom notification.
- **NEVER** infer meaning from the "current" code state for Custom notifications. Custom payloads are self-describing.

## Consequences

### Positive

- **Reliability**: "Custom" notifications cannot break due to code deployments.
- **Consistency**: "Semantic" notifications always match the currently running application version.
- **Simplicity**: The Cron job never needs to know _what_ it is delivering, only _that_ it is delivering a blob of JSON.

### Negative

- **Storage Size**: "Custom" payloads can be large (storing copy for 10 languages).
  - _Mitigation_: Text is cheap. Reliability is expensive.
- **Versioning**: Deleting a Semantic Template from code (`PASSWORD_RESET`) will break pending notifications of that type.
  - _Rule_: **NEVER** delete Template Types. Deprecate them, but keep the registry entry returning a no-op or valid fallback.
