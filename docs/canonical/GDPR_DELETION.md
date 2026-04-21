> Documentation Layer: Canonical Contract

# GDPR Account Deletion Implementation

## Overview

This document details the GDPR "Right to Erasure" (account deletion) implementation. The system implements a **strictly terminal, identity-driven deletion model** that blocks access immediately and removes all personal data asynchronously.

> [!CAUTION]
> **Deletion is Irreversible**
>
> Once a deletion request is made, it cannot be undone. Account recovery is strictly prohibited.
> Cancellation logic is permanently disabled by configuration (`DELETION_CANCELLATION_ALLOWED = false`).

## Architecture

The deletion process follows a **Two-Phase Commit** model:

1.  **Phase A: Synchronous Blocking (Immediate)**
    - Sets `Identity.deletedAt = NOW()`
    - Access blocked globally via `IdentityStatusGuard`
    - Auth provider is NOT contacted (backend-only enforcement)
    - Bootstrap returns `PENDING_DELETION`
2.  **Phase B: Grace Period (Retention)**
    - Date is retained for the configured grace period (default 30 days)
    - User remains blocked (`PENDING_DELETION`)
    - **NO cancellation possible**
3.  **Phase C: Asynchronous Anonymization (Final)**
    - Background job processes expired requests
    - All PI is anonymized/deleted per GDPR Registry
    - Identity marked as `anonymized = true`
    - Confirmation email sent (if applicable)

## Immediate Behavioral Suppression

> [!IMPORTANT]
> **Deletion enforces IMMEDIATE functional suppression, not just access blocking.**

When a deletion request is accepted, the following happens **synchronously at request time**:

### Access Blocking (Existing)

- `Identity.deletedAt` is set synchronously
- All protected API access is blocked (403)
- Bootstrap returns `PENDING_DELETION` status

### Behavioral Suppression (Critical)

- Notification profile is disabled immediately
- All scheduled notifications are cancelled
- New notification attempts return NO-OP
- Background jobs skip the identity
- The user receives nothing from the system ever again

**The identity becomes functionally inert the moment deletion is requested.**
This happens synchronously at request time, NOT after background processing.

## Status Flow

| State       | Identity Fields                                | API Access    | Bootstrap Status   | Notes                 |
| :---------- | :--------------------------------------------- | :------------ | :----------------- | :-------------------- |
| **Active**  | `deletedAt: null`, `anonymized: false`         | Allowed       | `ACTIVE`           | Normal state          |
| **Pending** | `deletedAt: [Order Time]`, `anonymized: false` | Blocked (403) | `PENDING_DELETION` | Sync blocking phase   |
| **Deleted** | `deletedAt: [Order Time]`, `anonymized: true`  | Blocked (403) | `DELETED`          | Final state (Derived) |

> [!NOTE]
> `DELETED` is a derived external status. Internally, the final state is represented by `anonymized = true`.

## Email Confirmation

The system is prepared to send a final confirmation email after anonymization completes.

- **Service**: `EmailNotificationService`
- **Trigger**: Fires automatically after `GdprDeletionService` completes anonymization
- **Email Address**: Captured _ephemerally_ before anonymization starts.
  - > [!IMPORTANT]
    > The email address is held in memory only during the deletion job. It is NEVER persisted or reattached to the anonymous identity.

_Note: Email delivery is currently a placeholder implementation._

## Security & Compliance Rules

1.  **No Auth Provider Dependencies**: Blocking occurs at the API gateway level, not via Supabase/Auth0 user deletion.
2.  **Fresh JWTs Blocked**: A new JWT issued after deletion request will still be blocked by `IdentityStatusGuard` due to `deletedAt` check.
3.  **No Soft Delete**: "Deletion" means permanent anonymization of PI. We do not keep "soft deleted" user records forever.
4.  **Audit Logging**: A generic `DELETE` audit log is created upon completion.

## Configuration

Required in `src/config/app.constants.ts`:

```typescript
// MUST be false to enforce terminal deletion
DELETION_CANCELLATION_ALLOWED: false;
```

