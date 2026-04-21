> Documentation Layer: Canonical Contract

# Test UI Contract

This document is the **single source of truth** for testing the backend API from an external UI.

> **Audience**: Test UI developers with no backend knowledge.
> **Purpose**: Enable end-to-end testing of all exposed API behaviors.

---

## 1. Overview

### What This API Is

A backend service that provides:

- **Public bootstrap** — App initialization configuration (versions, features, i18n) - unauthenticated
- **Authenticated bootstrap** — User startup context (identity status, minimal profile) - mandatory after login
- **User profile management** — Create and retrieve user profiles
- **Notification management** — List, read, and acknowledge notifications
- **Notification channel management** — Manage email and push delivery preferences
- **GDPR compliance endpoints** — Data export, deletion, suspension, recovery, and resume
- **Health checks** — Service availability monitoring
- **Internal admin console** — Operational tooling for admin users (separate auth)

### What This API Is Responsible For

- Validating JWT tokens (authentication)
- Enforcing role-based access (authorization)
- Managing user data and preferences
- Managing notification delivery channels (email addresses, push tokens)
- Sending notifications through email and push channels
- Processing GDPR requests (export, delete, suspend)

### What This API Is NOT Responsible For

- **User authentication** (login, logout, password reset) — handled by identity provider
- **Token issuance or refresh** — handled by identity provider

---

## 2. Authentication

### Required Headers

All authenticated endpoints require:

```http
Authorization: Bearer <JWT_TOKEN>
```

### JWT Expectations

The backend validates:

| Claim | Validation                            |
| ----- | ------------------------------------- |
| `sub` | Must be present — identifies the user |
| `iss` | Must match configured issuer URL      |
| `aud` | Must include configured audience      |
| `exp` | Must not be expired                   |

### Role Assumptions

Most endpoints require one of these roles in the JWT:

| Role     | Description                     |
| -------- | ------------------------------- |
| `USER`   | Standard authenticated user     |
| `ENTITY` | Organization or business entity |

**Admin Privileges** (for internal admin console only):

| Privilege     | Description                                      |
| ------------- | ------------------------------------------------ |
| `ADMIN_READ`  | Read-only access to admin console tables         |
| `ADMIN_WRITE` | Read + limited write access (no deletes allowed) |

Roles are extracted from JWT claims in this priority order:

1. `app_metadata.roles`
2. `user_metadata.roles`
3. `realm_access.roles`
4. `roles`

### Example JWT Payload (Regular User)

```json
{
  "sub": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "iss": "https://your-auth-provider.com",
  "aud": "your-api-audience",
  "exp": 1735344000,
  "email": "user@example.com",
  "app_metadata": {
    "roles": ["USER"]
  }
}
```

### Example JWT Payload (Admin User)

Admin users need additional claims for internal admin console access:

```json
{
  "sub": "admin-user-uuid",
  "iss": "https://your-auth-provider.com",
  "aud": "your-api-audience",
  "exp": 1735344000,
  "email": "admin@example.com",
  "internal_admin": true,
  "internal_admin_level": "write",
  "app_metadata": {
    "roles": ["USER"]
  }
}
```

**Admin JWT Claims**:

| Claim                  | Type    | Values         | Description                          |
| ---------------------- | ------- | -------------- | ------------------------------------ |
| `internal_admin`       | boolean | `true`/`false` | Must be `true` for admin access      |
| `internal_admin_level` | string  | `read`/`write` | Privilege level (defaults to `read`) |

> **Note**: Admin users may also be subject to an ENV-based allowlist (`ADMIN_USER_IDS`). If configured, users not in the list are denied even with valid admin JWT claims.

---

## 3. Response Format

### Standard Response Envelope

All successful API responses (except health checks) are wrapped in this format:

```json
{
  "data": { ... },
  "meta": {
    "requestId": "abc-123",
    "timestamp": "2026-01-05T00:00:00.000Z"
  }
}
```

### Error Response Format

All error responses follow this format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": { ... }
  },
  "meta": {
    "requestId": "abc-123",
    "timestamp": "2026-01-05T00:00:00.000Z"
  }
}
```

### Error Codes

| Code                            | HTTP Status | Description                  |
| ------------------------------- | ----------- | ---------------------------- |
| `AUTH_UNAUTHORIZED`             | 401         | Missing or invalid token     |
| `AUTH_TOKEN_EXPIRED`            | 401         | JWT has expired              |
| `AUTH_TOKEN_INVALID`            | 401         | JWT is malformed or invalid  |
| `AUTH_FORBIDDEN`                | 403         | Insufficient permissions     |
| `AUTH_INSUFFICIENT_PERMISSIONS` | 403         | Missing required role        |
| `RESOURCE_NOT_FOUND`            | 404         | Requested resource not found |
| `VALIDATION_ERROR`              | 400         | Request validation failed    |
| `VALIDATION_INVALID_INPUT`      | 400         | Invalid input format         |
| `CONFLICT`                      | 409         | Resource conflict            |
| `CONFLICT_DUPLICATE`            | 409         | Duplicate resource           |
| `INTERNAL_ERROR`                | 500         | Unexpected server error      |
| `DATABASE_ERROR`                | 500         | Database operation failed    |

### Validation Error Details

When `code` is `VALIDATION_ERROR`, the `details` field contains:

```json
{
  "fields": {
    "displayName": ["must be a string", "must not be empty"],
    "email": ["must be a valid email"]
  }
}
```

---

## 4. Endpoints Summary

### 4.1 Public Endpoints

These endpoints are **public** (no authentication required) and return **unwrapped responses**.

#### `GET /api/v1/public/bootstrap`

**Purpose**: Public client initialization configuration. Call this on app launch before authentication.

**Auth Required**: No (PUBLIC endpoint)

**Response Wrapped**: No (returns raw JSON)

**Side Effects**: None

**Rate Limit**: 300 requests / 60 seconds per IP

**Caching**: Response is cacheable. `Cache-Control: public, max-age=3600`

**IMPORTANT RESTRICTIONS**:

- This endpoint MUST NOT inspect JWTs
- This endpoint MUST NOT return user or identity data
- This endpoint MUST NOT perform suspension checks
- Response is identical for all callers

**Example Request**:

```http
GET /api/v1/public/bootstrap
```

**Example Response** (200 OK):

```json
{
  "updatePolicy": {
    "ios": {
      "minimumVersion": "1.0.0",
      "forceUpdate": false,
      "messages": [
        { "language": "en", "title": "Update Available", "body": "A new version is available." },
        {
          "language": "es",
          "title": "Actualización Disponible",
          "body": "Una nueva versión está disponible."
        }
      ]
    },
    "android": {
      "minimumVersion": "1.0.0",
      "forceUpdate": false,
      "messages": [
        { "language": "en", "title": "Update Available", "body": "A new version is available." }
      ]
    },
    "web": {
      "minimumVersion": "1.0.0",
      "forceUpdate": false,
      "messages": [
        { "language": "en", "title": "Update Available", "body": "A new version is available." }
      ]
    }
  },
  "metadata": {
    "apiVersion": "0.1.0",
    "policiesVersion": "1.0.0",
    "branding": {
      "companyName": "MyApp Inc.",
      "supportEmail": "support@myapp.com"
    }
  },
  "features": {
    "premiumEnabled": false,
    "pushNotificationsEnabled": true,
    "emailNotificationsEnabled": true,
    "dataExportEnabled": true,
    "accountSuspensionEnabled": true
  },
  "i18n": {
    "defaultLanguage": "en",
    "supportedLanguages": ["en", "es"]
  }
}
```

**Response Fields**:

| Field          | Type   | Description                            |
| -------------- | ------ | -------------------------------------- |
| `updatePolicy` | object | Platform-specific version requirements |
| `metadata`     | object | API version and branding info          |
| `features`     | object | Feature flags for UI toggling          |
| `i18n`         | object | Internationalization settings          |

**Update Policy Fields** (per platform):

| Field            | Type    | Description                                    |
| ---------------- | ------- | ---------------------------------------------- |
| `minimumVersion` | string  | Minimum required app version (semver)          |
| `forceUpdate`    | boolean | If true, block app until updated               |
| `messages`       | array   | Localized update messages (EN always included) |

**Feature Flags**:

| Flag                        | Type    | Description                      |
| --------------------------- | ------- | -------------------------------- |
| `premiumEnabled`            | boolean | Show premium features in UI      |
| `pushNotificationsEnabled`  | boolean | Show push notification settings  |
| `emailNotificationsEnabled` | boolean | Show email notification settings |
| `dataExportEnabled`         | boolean | Show "Download My Data" option   |
| `accountSuspensionEnabled`  | boolean | Show account suspension option   |

**Client Usage**:

1. Call on app launch (before authentication)
2. Check `updatePolicy[platform]` against current app version
3. If `forceUpdate` is true and app is outdated → block with update screen
4. Use `features` to show/hide UI elements
5. Use `i18n.supportedLanguages` for language picker
6. Cache for up to 1 hour, refresh on foreground

---

#### `POST /api/v1/bootstrap`

**Purpose**: Authenticated user startup context. **MANDATORY first call after login.**

**Auth Required**: Yes (USER or ENTITY role)

**Response Wrapped**: No (returns raw JSON)

**Side Effects**:

- Creates identity record if not exists (lazy creation)
- Updates last activity timestamp for active users

> **⚠️ CRITICAL: Mandatory Bootstrap Rule**
>
> Test UI developers **MUST** understand:
>
> 1. **Call this endpoint immediately after authentication** — before any other protected endpoint.
> 2. **Login success ≠ app access** — the user may be blocked (suspended, pending deletion, or deleted).
> 3. **Check `identity.status`** — only `ACTIVE` users have full app access.
> 4. **Skipping bootstrap causes undefined behavior** — other authenticated endpoints may fail or behave unexpectedly.
>
> This endpoint is the **authoritative source** for user lifecycle state.
> Blocking due to suspension, deletion, or pending deletion is enforced here, **not via 401 errors**.

**IMPORTANT**: This is a UX gate, not a security gate. Guards still enforce access on all protected endpoints.

**Example Request**:

```http
POST /api/v1/bootstrap
Authorization: Bearer <token>
```

**Response Variants**:

**1. ACTIVE User** (200 OK) - Full app access:

```json
{
  "identity": {
    "status": "ACTIVE",
    "roles": ["USER"]
  },
  "profile": {
    "id": "profile-uuid",
    "locale": "en",
    "timezone": "UTC"
  }
}
```

**2. SUSPENDED User with Recovery Available** (200 OK) - Show recovery option:

```json
{
  "identity": {
    "status": "SUSPENDED",
    "recoveryAvailable": true
  }
}
```

**3. SUSPENDED User without Recovery** (200 OK) - Recovery window expired:

```json
{
  "identity": {
    "status": "SUSPENDED",
    "recoveryAvailable": false
  }
}
```

**4. DELETED User** (200 OK) - Account permanently deleted (irreversible):

```json
{
  "identity": {
    "status": "DELETED"
  }
}
```

**5. PENDING_DELETION User** (200 OK) - Deletion requested, in grace period:

```json
{
  "identity": {
    "status": "PENDING_DELETION",
    "deletionScheduledAt": "2026-02-12T10:00:00.000Z"
  }
}
```

> **Note**: `deletionScheduledAt` is an ISO 8601 timestamp indicating when final deletion will occur (end of grace period, typically 30 days after request). The user is **blocked** during this period but deletion can be cancelled.

**6. New User (No Profile Yet)** (200 OK) - Needs onboarding:

```json
{
  "identity": {
    "status": "ACTIVE",
    "roles": ["USER"]
  },
  "profile": null
}
```

**Identity Status Values**:

| Status             | Description                                        | Blocked | App Behavior                                |
| ------------------ | -------------------------------------------------- | ------- | ------------------------------------------- |
| `ACTIVE`           | Normal, fully functional account                   | No      | Full app access                             |
| `SUSPENDED`        | Account is suspended, recovery window expired      | Yes     | Show suspension message                     |
| `PENDING_RECOVERY` | Suspended but recovery is still available          | Yes     | Show recovery option (`POST /gdpr/recover`) |
| `PENDING_DELETION` | Deletion requested, in grace period (reversible\*) | Yes     | Show deletion pending UI                    |
| `DELETED`          | Account permanently deleted/anonymized (final)     | Yes     | Show account deleted message                |

> **\*** `PENDING_DELETION` is reversible in principle (service supports it), but the cancel API endpoint is not yet exposed. See `POST /api/v1/gdpr/cancel-deletion` (Planned) section.

**Status Determination Priority** (first match wins):

1. `anonymized = true` → `DELETED`
2. `deletedAt != null` → `PENDING_DELETION`
3. `isSuspended = true` + recovery available → `PENDING_RECOVERY`
4. `isSuspended = true` + no recovery → `SUSPENDED`
5. Otherwise → `ACTIVE`

**Response Fields**:

| Field                          | Type    | Condition             | Description                                  |
| ------------------------------ | ------- | --------------------- | -------------------------------------------- |
| `identity.status`              | string  | Always                | Current identity status                      |
| `identity.roles`               | array   | When ACTIVE           | User roles (e.g., ["USER"])                  |
| `identity.recoveryAvailable`   | boolean | When SUSPENDED        | Whether recovery is possible                 |
| `identity.deletionScheduledAt` | string  | When PENDING_DELETION | ISO 8601 timestamp of scheduled final delete |
| `profile`                      | object  | When ACTIVE           | Minimal profile context (or null)            |
| `profile.id`                   | string  | When profile exists   | Profile UUID                                 |
| `profile.locale`               | string  | When profile exists   | User's preferred locale (e.g., "en")         |
| `profile.timezone`             | string  | When profile exists   | User's timezone (e.g., "UTC")                |

**Client Usage**:

1. Call immediately after successful authentication
2. Check `identity.status` to determine app access:
   - `ACTIVE` → Proceed to app (check if `profile` is null for onboarding)
   - `PENDING_RECOVERY` → Show recovery option (user can recover account via `POST /gdpr/recover`)
   - `SUSPENDED` → Show suspension message (recovery window expired)
   - `PENDING_DELETION` → Show deletion pending UI with `deletionScheduledAt` (cancel endpoint planned, not yet available)
   - `DELETED` → Show account deleted message (permanent, no recovery)
3. Do NOT cache this response (user status can change)
4. Do NOT duplicate public bootstrap data here

> **Lifecycle State Visibility**: This endpoint is the **authoritative** way to observe GDPR lifecycle state (suspension, deletion). Blocking is enforced via `identity.status`, **not** via 401 authentication errors. Test UI should validate lifecycle transitions by checking bootstrap responses.

**Error Responses**:

| HTTP Status | Error Code         | Description              |
| ----------- | ------------------ | ------------------------ |
| 401         | AUTH_UNAUTHORIZED  | Missing or invalid token |
| 401         | AUTH_TOKEN_EXPIRED | JWT has expired          |
| 403         | AUTH_FORBIDDEN     | Insufficient permissions |

---

#### `GET /api/v1/health`

**Purpose**: Basic liveness check.

**Auth Required**: No

**Response Wrapped**: No (returns raw JSON)

**Side Effects**: None

**Example Request**:

```http
GET /api/v1/health
```

**Example Response** (200 OK):

```json
{
  "status": "ok"
}
```

---

#### `GET /api/v1/health/detailed`

**Purpose**: Detailed readiness check (includes database connectivity).

**Auth Required**: No

**Response Wrapped**: No (returns raw JSON)

**Side Effects**: None

**Example Request**:

```http
GET /api/v1/health/detailed
```

**Example Response** (200 OK):

```json
{
  "status": "healthy",
  "timestamp": "2026-01-05T10:00:00.000Z",
  "components": {
    "database": {
      "status": "healthy",
      "latency": 5
    }
  }
}
```

**Possible Status Values**:

| Status      | Meaning                             |
| ----------- | ----------------------------------- |
| `healthy`   | All components operational          |
| `degraded`  | Some components have issues         |
| `unhealthy` | Critical components are not working |

---

### 4.2 User / Profile Endpoints

#### `GET /api/v1/profiles/me`

**Purpose**: Get the current user's profile.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**: None

**Example Request**:

```http
GET /api/v1/profiles/me
Authorization: Bearer <token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "profile-uuid",
    "externalUserId": "jwt-sub-value",
    "displayName": "John Doe",
    "language": "en",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-02T00:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

**Error Response** (404 Not Found):

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Profile not found"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

#### `POST /api/v1/profiles/me`

**Purpose**: Create or retrieve the current user's profile.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Creates user identity record if not exists
- Creates profile if not exists
- If profile already exists, returns existing profile (idempotent)

**Example Request**:

```http
POST /api/v1/profiles/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "John Doe",
  "language": "en"
}
```

**Request Body**:

| Field         | Type   | Required | Validation                                          |
| ------------- | ------ | -------- | --------------------------------------------------- |
| `displayName` | string | Yes      | 2-100 characters                                    |
| `language`    | string | No       | ISO 639-1 code (e.g., "en", "es"). Defaults to "en" |

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "profile-uuid",
    "externalUserId": "jwt-sub-value",
    "displayName": "John Doe",
    "language": "en",
    "createdAt": "2026-01-05T10:00:00.000Z",
    "updatedAt": "2026-01-05T10:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

#### `PATCH /api/v1/profiles/me`

**Purpose**: Partially update the current user's profile.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Updates only provided fields
- Preserves existing values for missing fields
- Syncs language changes to notification profile (best-effort)

**Example Request**:

```http
PATCH /api/v1/profiles/me
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "New Name",
  "language": "es"
}
```

**Request Body** (all fields optional):

| Field         | Type   | Description                         |
| ------------- | ------ | ----------------------------------- |
| `displayName` | string | Optional display name (2-100 chars) |
| `language`    | string | Optional language (ISO 639-1 code)  |

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "profile-uuid",
    "externalUserId": "jwt-sub-value",
    "displayName": "New Name",
    "language": "es",
    "createdAt": "2026-01-05T10:00:00.000Z",
    "updatedAt": "2026-01-05T10:05:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:05:00.000Z"
  }
}
```

---

### 4.3 Notification Endpoints

#### `GET /api/v1/notifications`

**Purpose**: List notifications for the current user.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**: None

**Query Parameters**:

| Param  | Type   | Default | Description                 |
| ------ | ------ | ------- | --------------------------- |
| `take` | number | 50      | Max notifications to return |
| `skip` | number | 0       | Offset for pagination       |

**Example Request**:

```http
GET /api/v1/notifications?take=20&skip=0
Authorization: Bearer <token>
```

**Example Response** (200 OK):

```json
{
  "data": [
    {
      "id": "notification-uuid",
      "type": "GDPR_EXPORT_READY",
      "payload": {
        "requestId": "export-request-uuid",
        "downloadUrl": "https://..."
      },
      "actorId": null,
      "visibleAt": "2026-01-05T10:00:00.000Z",
      "readAt": null,
      "createdAt": "2026-01-05T09:55:00.000Z"
    }
  ],
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

**Response Fields**:

| Field       | Type                    | Description                                                         |
| ----------- | ----------------------- | ------------------------------------------------------------------- |
| `id`        | string (UUID)           | Notification unique identifier                                      |
| `type`      | string                  | Notification type (see [Notification Types](#5-notification-types)) |
| `payload`   | object                  | Opaque payload, interpreted based on type                           |
| `actorId`   | string (UUID) or null   | Who triggered this notification (if applicable)                     |
| `visibleAt` | ISO date string         | When the notification became visible                                |
| `readAt`    | ISO date string or null | When the user marked as read                                        |
| `createdAt` | ISO date string         | When the notification was created                                   |

---

#### `GET /api/v1/notifications/unread-exists`

**Purpose**: Check if user has any unread notifications (for UI badges).

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**: None

**Example Request**:

```http
GET /api/v1/notifications/unread-exists
Authorization: Bearer <token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "hasUnread": true
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

#### `POST /api/v1/notifications/:id/read`

**Purpose**: Mark a specific notification as read.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Sets `readAt` timestamp on the notification
- Idempotent: if already read, returns current state

**Example Request**:

```http
POST /api/v1/notifications/notification-uuid/read
Authorization: Bearer <token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "notification-uuid",
    "type": "GDPR_EXPORT_READY",
    "payload": { "requestId": "..." },
    "actorId": null,
    "visibleAt": "2026-01-05T10:00:00.000Z",
    "readAt": "2026-01-05T10:05:00.000Z",
    "createdAt": "2026-01-05T09:55:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:05:00.000Z"
  }
}
```

**Error Response** (404 Not Found):

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Notification not found"
  },
  "meta": {
    "timestamp": "2026-01-05T10:05:00.000Z"
  }
}
```

---

#### `POST /api/v1/notifications/read-all`

**Purpose**: Mark all notifications as read for the current user.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Sets `readAt` timestamp on all unread notifications
- Returns count of notifications marked as read

**Example Request**:

```http
POST /api/v1/notifications/read-all
Authorization: Bearer <token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "count": 5
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

### 4.4 Notification Profile / Channel Endpoints

These endpoints manage how notifications are delivered to the user.

#### `GET /api/v1/notification-profile`

**Purpose**: Get the current user's notification profile with all channels.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Creates notification profile automatically if none exists

**Example Request**:

```http
GET /api/v1/notification-profile
Authorization: Bearer <token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "profile": {
      "id": "profile-uuid",
      "notificationsEnabled": true,
      "language": "en",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-02T00:00:00.000Z"
    },
    "emailChannels": [
      {
        "id": "email-channel-uuid",
        "email": "user@example.com",
        "enabled": true,
        "promoEnabled": false,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "pushChannels": [
      {
        "id": "push-channel-uuid",
        "uniqueKey": "device-12345",
        "platform": "ios",
        "isActive": true,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

#### `PUT /api/v1/notification-profile`

**Purpose**: Update notification profile settings.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Updates notification preferences

**Example Request**:

```http
PUT /api/v1/notification-profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "notificationsEnabled": true,
  "language": "es"
}
```

**Request Body**:

| Field                  | Type    | Required | Description                         |
| ---------------------- | ------- | -------- | ----------------------------------- |
| `notificationsEnabled` | boolean | No       | Master toggle for all notifications |
| `language`             | string  | No       | Preferred language (max 10 chars)   |

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "profile-uuid",
    "notificationsEnabled": true,
    "language": "es",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-05T10:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

#### `POST /api/v1/notification-profile/email`

**Purpose**: Add or update an email channel.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Creates new email channel if email address is new
- Updates existing channel if email address already exists

**Example Request**:

```http
POST /api/v1/notification-profile/email
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "user@example.com",
  "enabled": true,
  "promoEnabled": false
}
```

**Request Body**:

| Field          | Type    | Required | Description                                 |
| -------------- | ------- | -------- | ------------------------------------------- |
| `email`        | string  | Yes      | Valid email address                         |
| `enabled`      | boolean | No       | Whether transactional notifications enabled |
| `promoEnabled` | boolean | No       | Whether promotional notifications enabled   |

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "email-channel-uuid",
    "email": "user@example.com",
    "enabled": true,
    "promoEnabled": false,
    "createdAt": "2026-01-05T10:00:00.000Z",
    "updatedAt": "2026-01-05T10:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

#### `PUT /api/v1/notification-profile/email/:id/enabled`

**Purpose**: Enable or disable an email channel.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Updates the enabled state of the email channel

**Example Request**:

```http
PUT /api/v1/notification-profile/email/email-channel-uuid/enabled
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": false
}
```

**Request Body**:

| Field     | Type    | Required | Description                |
| --------- | ------- | -------- | -------------------------- |
| `enabled` | boolean | Yes      | Whether channel is enabled |

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "email-channel-uuid",
    "email": "user@example.com",
    "enabled": false,
    "promoEnabled": false,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-05T10:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

#### `DELETE /api/v1/notification-profile/email/:id`

**Purpose**: Remove an email channel.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Permanently deletes the email channel

**Example Request**:

```http
DELETE /api/v1/notification-profile/email/email-channel-uuid
Authorization: Bearer <token>
```

**Response** (204 No Content):

No body returned.

---

#### `POST /api/v1/notification-profile/push`

**Purpose**: Register or update a push token.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Uses `uniqueKey` for device-level deduplication
- If a push channel with the same `uniqueKey` exists, the token is rotated

**Example Request**:

```http
POST /api/v1/notification-profile/push
Authorization: Bearer <token>
Content-Type: application/json

{
  "expoToken": "ExponentPushToken[xxxxxxxxxxxxxx]",
  "uniqueKey": "device-12345",
  "platform": "ios"
}
```

**Request Body**:

| Field       | Type   | Required | Description                                       |
| ----------- | ------ | -------- | ------------------------------------------------- |
| `expoToken` | string | Yes      | Expo push token (1-500 chars)                     |
| `uniqueKey` | string | Yes      | Device identifier for deduplication (1-200 chars) |
| `platform`  | string | No       | Platform: "ios", "android", or "unknown"          |

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "push-channel-uuid",
    "uniqueKey": "device-12345",
    "platform": "ios",
    "isActive": true,
    "createdAt": "2026-01-05T10:00:00.000Z",
    "updatedAt": "2026-01-05T10:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

> **Note**: The `expoToken` is intentionally NOT returned in responses for security reasons.

---

#### `DELETE /api/v1/notification-profile/push/:id`

**Purpose**: Deactivate and remove a push channel.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Permanently deletes the push channel

**Example Request**:

```http
DELETE /api/v1/notification-profile/push/push-channel-uuid
Authorization: Bearer <token>
```

**Response** (204 No Content):

No body returned.

---

### 4.5 GDPR Endpoints

#### `POST /api/v1/gdpr/export`

**Purpose**: Request a full GDPR data export.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Creates a pending export request
- Triggers background processing

**Example Response** (202 Accepted):

```json
{
  "data": {
    "id": "request-uuid",
    "requestType": "GDPR_EXPORT",
    "status": "PENDING",
    "createdAt": "2026-01-05T10:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

#### `GET /api/v1/gdpr/exports/:requestId`

**Purpose**: Check the status of an export request.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**: None

**Example Request**:

```http
GET /api/v1/gdpr/exports/request-uuid
Authorization: Bearer <token>
```

**Example Response** (200 OK — completed):

```json
{
  "data": {
    "requestId": "request-uuid",
    "status": "COMPLETED",
    "createdAt": "2026-01-05T10:00:00.000Z",
    "completedAt": "2026-01-05T10:05:00.000Z",
    "expiresAt": "2026-01-12T10:05:00.000Z",
    "downloadAvailable": true
  },
  "meta": {
    "timestamp": "2026-01-05T10:10:00.000Z"
  }
}
```

**Possible Status Values**:

| Status       | Meaning                                   |
| ------------ | ----------------------------------------- |
| `PENDING`    | Request received, waiting to be processed |
| `PROCESSING` | Export is being generated                 |
| `COMPLETED`  | Export ready for download                 |
| `FAILED`     | Export generation failed                  |
| `EXPIRED`    | Download link has expired                 |

**Response Fields**:

| Field               | Type                    | Description                       |
| ------------------- | ----------------------- | --------------------------------- |
| `requestId`         | string (UUID)           | Request unique identifier         |
| `status`            | string                  | Current processing status         |
| `createdAt`         | ISO date string         | When request was created          |
| `completedAt`       | ISO date string or null | When processing completed         |
| `expiresAt`         | ISO date string or null | When export file expires          |
| `downloadAvailable` | boolean                 | Whether download is ready         |
| `errorMessage`      | string (optional)       | Error details if status is FAILED |

---

#### `GET /api/v1/gdpr/exports/:requestId/download`

**Purpose**: Get a download URL for a completed export.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Returns a short-lived presigned URL (expires in ~5 minutes)
- Download attempts are logged for audit

**Example Request**:

```http
GET /api/v1/gdpr/exports/request-uuid/download
Authorization: Bearer <token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "downloadUrl": "https://storage.example.com/exports/...",
    "expiresAt": "2026-01-05T10:10:00.000Z",
    "filename": "gdpr-export-2026-01-05.zip",
    "fileSize": 12345
  },
  "meta": {
    "timestamp": "2026-01-05T10:05:00.000Z"
  }
}
```

**Response Fields**:

| Field         | Type              | Description                     |
| ------------- | ----------------- | ------------------------------- |
| `downloadUrl` | string            | Presigned URL for download      |
| `expiresAt`   | ISO date string   | When the download URL expires   |
| `filename`    | string            | Original filename of the export |
| `fileSize`    | number (optional) | File size in bytes              |

**Error Responses**:

| Code          | Condition                                |
| ------------- | ---------------------------------------- |
| 403 Forbidden | User doesn't own this request            |
| 404 Not Found | Request doesn't exist or isn't completed |
| 410 Gone      | Export has expired                       |

---

#### `POST /api/v1/gdpr/delete`

**Purpose**: Request GDPR data deletion (Right to Erasure).

**Auth Required**: Yes (USER or ENTITY role)

> **⚠️ IMPORTANT: Terminal Deletion Model**
>
> Deletion is **terminal and irreversible**. This endpoint initiates a deletion lifecycle:
>
> 1. **Immediate Effects** (synchronous):
>    - User enters `PENDING_DELETION` state
>    - Account is **immediately blocked** (bootstrap returns `PENDING_DELETION`)
>    - Pending notifications are cancelled
>    - Pending export requests are cancelled
> 2. **Grace Period** (default 30 days):
>    - User remains blocked
>    - `POST /api/v1/bootstrap` returns `deletionScheduledAt` with the final deletion date
>    - **Cancellation is NOT allowed** during this period
> 3. **Final Deletion** (asynchronous, after grace period):
>    - Data is permanently anonymized
>    - User transitions to `DELETED` state
>    - **This is irreversible**
>
> Blocking is enforced via bootstrap, **not** via 401 authentication errors.

**Side Effects** (Immediate):

- Sets `identity.deletedAt` (marks pending deletion)
- Account is blocked at bootstrap level
- Cancels all pending scheduled notifications
- Cancels any in-progress GDPR export requests
- Creates audit log entry

**Example Response** (202 Accepted):

```json
{
  "data": {
    "id": "request-uuid",
    "requestType": "GDPR_DELETE",
    "status": "PENDING",
    "createdAt": "2026-01-05T10:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

**After Calling This Endpoint**:

Subsequent calls to `POST /api/v1/bootstrap` will return:

```json
{
  "identity": {
    "status": "PENDING_DELETION",
    "deletionScheduledAt": "2026-02-04T10:00:00.000Z"
  }
}
```

**Error Responses**:

| HTTP Status | Condition                                                     |
| ----------- | ------------------------------------------------------------- |
| 403         | User is already `DELETED` (anonymized)                        |
| 409         | User is already in `PENDING_DELETION` state                   |
| 409         | User is currently suspended (must recover or wait for expiry) |

---

#### `POST /api/v1/gdpr/cancel-deletion`

**Purpose**: Cancel a pending deletion request during the grace period.

**Auth Required**: Yes (USER or ENTITY role)

**Status**: ⛔ **Disabled** — Deletion is now terminal by design. This endpoint is disabled and will not be implemented.

**Preconditions**: None - this endpoint is permanently disabled.

**Side Effects** (when implemented):

- Clears `identity.deletedAt` (restores access)
- Cancels the GDPR delete request record
- Creates audit log entry
- User transitions back to `ACTIVE` status at bootstrap

**Expected Response** (200 OK):

```json
{
  "data": {
    "identityId": "identity-uuid",
    "status": "CANCELLED",
    "message": "Account deletion cancelled. Access restored."
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

**Expected Error Responses**:

| HTTP Status   | Condition                              |
| ------------- | -------------------------------------- |
| 403 Forbidden | Cancellation disabled in config        |
| 403 Forbidden | User is already `DELETED` (anonymized) |
| 404 Not Found | No pending deletion request found      |

> **Note**: `PENDING_DELETION` is a blocking state with no user-driven recovery path. Cancellation is strictly prohibited by configuration.

---

#### `POST /api/v1/gdpr/suspend`

**Purpose**: Request account suspension (Right to Restriction of Processing).

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Creates a pending suspension request
- Personal data is temporarily anonymized
- Account can be resumed within grace period (30 days default)
- After grace period, auto-escalates to deletion

**Example Response** (202 Accepted):

```json
{
  "data": {
    "id": "request-uuid",
    "requestType": "GDPR_SUSPEND",
    "status": "PENDING",
    "createdAt": "2026-01-05T10:00:00.000Z"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

---

#### `POST /api/v1/gdpr/recover`

**Purpose**: Recover a suspended account.

**Auth Required**: Yes (USER or ENTITY role)

**Side Effects**:

- Restores all backed-up personal data
- Marks backups as used (consumed)
- Transitions lifecycle state to RECOVERED
- Emits hooks for external systems

**Recovery Preconditions** (ALL must be met):

1. Backup exists for the suspension
2. Backup has not been used (consumed)
3. Current time < suspendedUntil deadline
4. Account is in SUSPENDED state
5. Suspension has not expired

**Example Request**:

```http
POST /api/v1/gdpr/recover
Authorization: Bearer <token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "userId": "identity-uuid",
    "suspensionUid": "suspension-unique-id",
    "recoveredAt": "2026-01-05T10:00:00.000Z",
    "lifecycleState": "RECOVERED",
    "summary": [
      {
        "tableName": "profiles",
        "rowsRestored": 1
      },
      {
        "tableName": "notification_logs",
        "rowsRestored": 2
      }
    ],
    "totalRowsRestored": 3
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

**Response Fields**:

| Field               | Type            | Description                   |
| ------------------- | --------------- | ----------------------------- |
| `userId`            | string (UUID)   | Identity ID of the user       |
| `suspensionUid`     | string          | Unique suspension identifier  |
| `recoveredAt`       | ISO date string | When recovery completed       |
| `lifecycleState`    | string          | Always "RECOVERED" on success |
| `summary`           | array           | Per-table restoration summary |
| `totalRowsRestored` | number          | Total database rows restored  |

**Error Responses**:

| Code          | Condition                                      |
| ------------- | ---------------------------------------------- |
| 404 Not Found | No active suspension exists                    |
| 403 Forbidden | Recovery preconditions not met (expired, etc.) |

---

## 5. Notification Types

The backend generates these notification types. Clients should handle them appropriately.

| Type                       | When Triggered                                     | Payload Fields             |
| -------------------------- | -------------------------------------------------- | -------------------------- |
| `GDPR_EXPORT_READY`        | GDPR export is ready for download                  | `requestId`, `downloadUrl` |
| `GDPR_EXPORT_EXPIRED`      | GDPR export has expired                            | `requestId`                |
| `GDPR_EXPORT_DELETED`      | GDPR export file was deleted                       | `requestId`                |
| `GDPR_DELETE_COMPLETED`    | GDPR deletion completed                            | `requestId`                |
| `GDPR_SUSPEND_COMPLETED`   | Account suspension completed                       | `requestId`                |
| `GDPR_RESUME_COMPLETED`    | Account resumed from suspension                    | `requestId`                |
| `GDPR_SUSPENSION_EXPIRING` | Suspension is about to expire (escalate to delete) | `requestId`, `expiresAt`   |
| `SYSTEM_MESSAGE`           | General system notification                        | `message`, `title`         |

---

## 6. Notification Delivery Behavior

This table describes **observable outcomes** when notifications are sent by the system.

### Delivery Outcomes

| Scenario                           | Email Outcome          | Push Outcome               | Notes                             |
| ---------------------------------- | ---------------------- | -------------------------- | --------------------------------- |
| User is active, email enabled      | SENT                   | SENT                       | Normal delivery                   |
| User is active, email disabled     | SKIPPED                | SENT                       | User preference respected         |
| User is active, push disabled      | SENT                   | SKIPPED                    | User preference respected         |
| User is active, no push token      | SENT                   | SKIPPED                    | No registered device              |
| User is active, invalid push token | SENT                   | FAILED → token deactivated | Token automatically removed       |
| User is suspended                  | SKIPPED (except legal) | SKIPPED (except legal)     | Only legal notifications allowed  |
| User is deleted                    | SKIPPED                | SKIPPED                    | No notifications to deleted users |
| User has no notification profile   | SKIPPED                | SKIPPED                    | Profile must be created first     |
| Master toggle disabled             | SKIPPED                | SKIPPED                    | `notificationsEnabled = false`    |

### Notification Categories

| Category | Description                        | Suspended Users |
| -------- | ---------------------------------- | --------------- |
| `SYSTEM` | Security alerts, account activity  | NOT allowed     |
| `LEGAL`  | Terms updates, GDPR communications | ALLOWED         |
| `PROMO`  | Marketing, newsletters             | NOT allowed     |

---

## 7. Internal Admin Endpoints

These endpoints are for **admin users only** and require special JWT claims.

> **Important**: Admin endpoints use **unwrapped responses** (no `data`/`meta` envelope).

### Admin Authentication

Admin endpoints require:

1. Valid JWT token (same as regular endpoints)
2. `internal_admin: true` claim in the JWT
3. `internal_admin_level: "read"` or `"write"` claim

**Example Admin JWT**:

```json
{
  "sub": "admin-user-uuid",
  "internal_admin": true,
  "internal_admin_level": "write"
}
```

### Admin Rate Limiting

| Endpoint Type  | Limit       | Window     | Scope    |
| -------------- | ----------- | ---------- | -------- |
| Internal Admin | 60 requests | 60 seconds | Per User |

### Admin Error Responses

| Code | Condition                                 |
| ---- | ----------------------------------------- |
| 401  | Missing or invalid JWT                    |
| 403  | No admin privileges or insufficient level |
| 404  | Table/record not found                    |
| 400  | Invalid table name or parameters          |

---

### 7.1 Admin Console Endpoints

Base path: `/api/internal/admin`

#### `GET /api/internal/admin/health`

**Purpose**: Health check for admin console.

**Privilege Required**: `ADMIN_READ`

**Example Request**:

```http
GET /api/internal/admin/health
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "status": "ok",
    "privilege": "ADMIN_WRITE",
    "timestamp": "2026-01-11T10:00:00.000Z"
  }
}
```

---

#### `GET /api/internal/admin/tables`

**Purpose**: List all visible tables with their permissions.

**Privilege Required**: `ADMIN_READ`

**Example Request**:

```http
GET /api/internal/admin/tables
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": [
    {
      "name": "identities",
      "prismaDelegate": "identity",
      "readable": true,
      "writable": false
    },
    {
      "name": "profiles",
      "prismaDelegate": "profile",
      "readable": true,
      "writable": false
    },
    {
      "name": "notification_logs",
      "prismaDelegate": "notificationLog",
      "readable": true,
      "writable": true
    }
  ]
}
```

**Response Fields**:

| Field            | Type    | Description                          |
| ---------------- | ------- | ------------------------------------ |
| `name`           | string  | Database table name (snake_case)     |
| `prismaDelegate` | string  | Prisma client model name (camelCase) |
| `readable`       | boolean | Can be queried via admin console     |
| `writable`       | boolean | Can be updated via admin console     |

---

#### `GET /api/internal/admin/query`

**Purpose**: Query records from a table with optional filtering.

**Privilege Required**: `ADMIN_READ`

**Query Parameters**:

| Param         | Type   | Required | Description                       |
| ------------- | ------ | -------- | --------------------------------- |
| `table`       | string | Yes      | Table name (from `/tables`)       |
| `limit`       | number | No       | Max records (default 50, max 100) |
| `offset`      | number | No       | Pagination offset (default 0)     |
| `filterField` | string | No       | Field name to filter by           |
| `filterValue` | string | No       | Value to filter by                |

**Example Request**:

```http
GET /api/internal/admin/query?table=profiles&limit=10&offset=0
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": [
    {
      "id": "profile-uuid",
      "identityId": "identity-uuid",
      "displayName": "John Doe",
      "language": "en",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-02T00:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

**Example with Filter**:

```http
GET /api/internal/admin/query?table=gdpr_requests&filterField=status&filterValue=COMPLETED
Authorization: Bearer <admin-token>
```

---

#### `GET /api/internal/admin/record/:table/:id`

**Purpose**: Get a single record by ID.

**Privilege Required**: `ADMIN_READ`

**Path Parameters**:

| Param   | Type   | Description |
| ------- | ------ | ----------- |
| `table` | string | Table name  |
| `id`    | string | Record UUID |

**Example Request**:

```http
GET /api/internal/admin/record/profiles/profile-uuid
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "profile-uuid",
    "identityId": "identity-uuid",
    "displayName": "John Doe",
    "language": "en",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-02T00:00:00.000Z"
  }
}
```

---

#### `POST /api/internal/admin/update`

**Purpose**: Update a single record.

**Privilege Required**: `ADMIN_WRITE`

**Restrictions**:

- Only works on tables marked as `writable: true`
- No bulk operations
- No deletes allowed

**Request Body**:

| Field   | Type   | Required | Description                   |
| ------- | ------ | -------- | ----------------------------- |
| `table` | string | Yes      | Table name (must be writable) |
| `id`    | string | Yes      | Record UUID to update         |
| `data`  | object | Yes      | Fields to update              |

**Example Request**:

```http
POST /api/internal/admin/update
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "table": "notification_logs",
  "id": "notification-uuid",
  "data": {
    "readAt": "2026-01-11T10:00:00.000Z"
  }
}
```

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "notification-uuid",
    "type": "GDPR_EXPORT_READY",
    "readAt": "2026-01-11T10:00:00.000Z"
  }
}
```

**Error Response** (403 Forbidden - table not writable):

```json
{
  "statusCode": 403,
  "message": "Table 'profiles' is not writable",
  "error": "Forbidden"
}
```

---

### 7.2 Cleanup Job Endpoints

These endpoints allow admins to view and trigger infrastructure cleanup jobs.

#### `GET /api/internal/admin/cleanup/jobs`

**Purpose**: List available cleanup jobs.

**Privilege Required**: `ADMIN_READ`

**Example Request**:

```http
GET /api/internal/admin/cleanup/jobs
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": [
    {
      "name": "expired-exports",
      "description": "Delete expired GDPR export files",
      "schedule": "0 3 * * *"
    },
    {
      "name": "stale-notifications",
      "description": "Delete old notifications",
      "schedule": "0 4 * * *"
    }
  ]
}
```

---

#### `POST /api/internal/admin/cleanup/run-all`

**Purpose**: Run all cleanup jobs manually.

**Privilege Required**: `ADMIN_WRITE`

**Example Request**:

```http
POST /api/internal/admin/cleanup/run-all
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "totalRecordsDeleted": 15,
    "durationMs": 1234,
    "jobs": [
      {
        "name": "expired-exports",
        "recordsDeleted": 5,
        "durationMs": 500,
        "error": null,
        "metadata": {}
      },
      {
        "name": "stale-notifications",
        "recordsDeleted": 10,
        "durationMs": 734,
        "error": null,
        "metadata": {}
      }
    ]
  }
}
```

---

#### `POST /api/internal/admin/cleanup/run/:job`

**Purpose**: Run a specific cleanup job.

**Privilege Required**: `ADMIN_WRITE`

**Path Parameters**:

| Param | Type   | Description             |
| ----- | ------ | ----------------------- |
| `job` | string | Job name (from `/jobs`) |

**Example Request**:

```http
POST /api/internal/admin/cleanup/run/expired-exports
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "name": "expired-exports",
    "recordsDeleted": 5,
    "durationMs": 500,
    "error": null,
    "metadata": {
      "filesDeleted": 5,
      "bytesFreed": 1234567
    }
  }
}
```

**Error Response** (job not found):

```json
{
  "data": null,
  "error": "Cleanup job \"unknown-job\" not found"
}
```

---

### 7.3 GDPR Coverage Endpoints

These endpoints provide visibility into GDPR compliance coverage.

#### `GET /api/internal/admin/gdpr/coverage`

**Purpose**: Get GDPR coverage status for all database tables.

**Privilege Required**: `ADMIN_READ`

**Example Request**:

```http
GET /api/internal/admin/gdpr/coverage
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "totalTables": 15,
    "registeredForExport": 8,
    "explicitlyExcluded": 5,
    "notRegistered": 2,
    "tables": [
      {
        "tableName": "profiles",
        "status": "INCLUDED",
        "exportEnabled": true,
        "strategy": "DELETE"
      },
      {
        "tableName": "_prisma_migrations",
        "status": "EXCLUDED",
        "exportEnabled": false,
        "reason": "Infrastructure table"
      },
      {
        "tableName": "some_new_table",
        "status": "WARNING",
        "exportEnabled": false,
        "reason": "Not registered in GDPR registry"
      }
    ]
  }
}
```

**Table Status Values**:

| Status     | Meaning                                    |
| ---------- | ------------------------------------------ |
| `INCLUDED` | Table is registered for GDPR exports       |
| `EXCLUDED` | Table explicitly excluded (infrastructure) |
| `WARNING`  | Table not registered - potential gap       |

---

#### `GET /api/internal/admin/gdpr/warnings`

**Purpose**: Get only tables with GDPR coverage warnings.

**Privilege Required**: `ADMIN_READ`

**Example Request**:

```http
GET /api/internal/admin/gdpr/warnings
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "count": 2,
    "tables": ["some_new_table", "another_unregistered_table"],
    "hasWarnings": true
  }
}
```

---

### 7.4 GDPR Admin Endpoints

Base path: `/api/internal/gdpr`

These endpoints provide read-only access to GDPR requests for monitoring.

#### `GET /api/internal/gdpr/requests`

**Purpose**: List all GDPR requests with filtering and pagination.

**Privilege Required**: `ADMIN_READ`

**Query Parameters**:

| Param         | Type   | Required | Description                                                                 |
| ------------- | ------ | -------- | --------------------------------------------------------------------------- |
| `requestType` | string | No       | Filter by type: `GDPR_EXPORT`, `GDPR_DELETE`, `GDPR_SUSPEND`                |
| `status`      | string | No       | Filter by status: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `EXPIRED` |
| `limit`       | number | No       | Max results (default 20, max 100)                                           |
| `offset`      | number | No       | Pagination offset (default 0)                                               |

**Example Request**:

```http
GET /api/internal/gdpr/requests?requestType=GDPR_EXPORT&status=COMPLETED&limit=10
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": [
    {
      "id": "request-uuid",
      "identityId": "identity-uuid",
      "requestType": "GDPR_EXPORT",
      "status": "COMPLETED",
      "createdAt": "2026-01-05T10:00:00.000Z",
      "completedAt": "2026-01-05T10:05:00.000Z",
      "expiresAt": "2026-01-12T10:05:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

> **Security Note**: Storage keys and presigned URLs are never exposed in admin responses.

---

#### `GET /api/internal/gdpr/requests/:id`

**Purpose**: Get a single GDPR request by ID.

**Privilege Required**: `ADMIN_READ`

**Example Request**:

```http
GET /api/internal/gdpr/requests/request-uuid
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "id": "request-uuid",
    "identityId": "identity-uuid",
    "requestType": "GDPR_EXPORT",
    "status": "COMPLETED",
    "createdAt": "2026-01-05T10:00:00.000Z",
    "updatedAt": "2026-01-05T10:05:00.000Z",
    "completedAt": "2026-01-05T10:05:00.000Z",
    "expiresAt": "2026-01-12T10:05:00.000Z",
    "downloadCount": 2,
    "errorMessage": null
  }
}
```

---

#### `GET /api/internal/gdpr/metrics`

**Purpose**: Get aggregated GDPR metrics for monitoring.

**Privilege Required**: `ADMIN_READ`

**Example Request**:

```http
GET /api/internal/gdpr/metrics
Authorization: Bearer <admin-token>
```

**Example Response** (200 OK):

```json
{
  "data": {
    "totalRequests": 150,
    "byType": {
      "GDPR_EXPORT": 100,
      "GDPR_DELETE": 30,
      "GDPR_SUSPEND": 20
    },
    "byStatus": {
      "PENDING": 5,
      "PROCESSING": 2,
      "COMPLETED": 130,
      "FAILED": 8,
      "EXPIRED": 5
    },
    "pendingExports": 3,
    "expiredExports": 5,
    "totalDownloads": 85
  }
}
```

---

## 8. Rate Limiting

The API implements rate limiting with tiered limits.

### Limit Tiers

| Endpoint Type       | Limit        | Window     | Scope    |
| ------------------- | ------------ | ---------- | -------- |
| Public (health)     | 300 requests | 60 seconds | Per IP   |
| Authenticated       | 120 requests | 60 seconds | Per User |
| Strict (GDPR, etc.) | 30 requests  | 60 seconds | Per User |

### Rate Limit Response (429 Too Many Requests)

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too Many Requests"
  },
  "meta": {
    "timestamp": "2026-01-05T10:00:00.000Z"
  }
}
```

**Headers**:

```http
Retry-After: 60
```

---

## 9. Test Scenarios

### Scenario 1: First Login / Profile Creation

**Steps**:

1. Obtain a valid JWT from your identity provider
2. Call `GET /api/v1/profiles/me` → Expect 404 (no profile yet)
3. Call `POST /api/v1/profiles/me` with display name → Expect 200 with new profile
4. Call `GET /api/v1/profiles/me` again → Expect 200 with same profile

**Expected Outcome**: Profile is created and persisted.

---

### Scenario 2: Manage Notification Channels

**Steps**:

1. Call `GET /api/v1/notification-profile` → Profile auto-created if needed
2. Call `POST /api/v1/notification-profile/email` with email → Expect 200
3. Call `POST /api/v1/notification-profile/push` with token → Expect 200
4. Call `GET /api/v1/notification-profile` → See both channels listed
5. Call `PUT /api/v1/notification-profile/email/:id/enabled` to disable → Expect 200
6. Call `DELETE /api/v1/notification-profile/push/:id` → Expect 204

**Expected Outcome**: Channels can be added, modified, and removed.

---

### Scenario 3: List and Read Notifications

**Steps**:

1. Call `GET /api/v1/notifications` → Expect 200 with array
2. Call `GET /api/v1/notifications/unread-exists` → Note `hasUnread` value
3. If notifications exist, call `POST /api/v1/notifications/:id/read`
4. Call `GET /api/v1/notifications/unread-exists` again → `hasUnread` may change

**Expected Outcome**: Notifications can be listed and marked as read.

---

### Scenario 4: Mark All Notifications as Read

**Steps**:

1. Call `POST /api/v1/notifications/read-all` → Expect 200 with count
2. Call `GET /api/v1/notifications/unread-exists` → Expect `hasUnread: false`

**Expected Outcome**: All notifications marked as read.

---

### Scenario 5: Request GDPR Export

**Steps**:

1. Call `POST /api/v1/gdpr/export` → Expect 202 with request ID
2. Call `POST /api/v1/gdpr/export` again → Expect 409 (duplicate)
3. Poll `GET /api/v1/gdpr/exports/:requestId` until status is `COMPLETED`
4. Call `GET /api/v1/gdpr/exports/:requestId/download` → Expect download URL
5. Check `GET /api/v1/notifications` for export-ready notification

**Expected Outcome**: Export is processed and downloadable.

---

### Scenario 6: Suspend and Recover Account

**Steps**:

1. Call `POST /api/v1/gdpr/suspend` → Expect 202
2. Wait for processing (poll or check notifications)
3. Observe that profile data may appear anonymized
4. Call `POST /api/v1/gdpr/recover` → Expect 200
5. Call `GET /api/v1/profiles/me` → Expect original data restored

**Expected Outcome**: Account can be suspended and recovered.

---

### Scenario 7: Verify No Duplicate Notifications

**Steps**:

1. Trigger an action that creates a notification (e.g., GDPR export)
2. Call `GET /api/v1/notifications` and count notifications
3. Repeat the same action
4. Call `GET /api/v1/notifications` again
5. Verify notification count increased by expected amount (not duplicated)

**Expected Outcome**: Each action creates exactly one notification.

---

### Scenario 8: Authentication Failure

**Steps**:

1. Call any authenticated endpoint without `Authorization` header → Expect 401
2. Call with invalid/expired token → Expect 401
3. Call with valid token but missing role → Expect 403

**Expected Outcome**: Proper authentication and authorization errors.

---

### Scenario 9: Validation Errors

**Steps**:

1. Call `POST /api/v1/profiles/me` with empty body → Expect 400
2. Check error response has `code: "VALIDATION_ERROR"`
3. Check `details.fields` contains specific field errors

**Expected Outcome**: Validation errors are properly formatted with field-level details.

---

### Scenario 10: Admin Health Check

**Steps**:

1. Obtain a JWT with `internal_admin: true` and `internal_admin_level: "read"`
2. Call `GET /api/internal/admin/health` → Expect 200 with privilege info
3. Try without admin JWT → Expect 403

**Expected Outcome**: Admin health check works for admin users only.

---

### Scenario 11: Admin Table Query

**Steps**:

1. Call `GET /api/internal/admin/tables` → Get list of visible tables
2. Choose a readable table (e.g., `profiles`)
3. Call `GET /api/internal/admin/query?table=profiles&limit=10`
4. Verify records are returned
5. Try with invalid table name → Expect 400

**Expected Outcome**: Admin can query visible tables with pagination.

---

### Scenario 12: Admin Record Update

**Steps**:

1. Get a JWT with `internal_admin_level: "write"`
2. Call `GET /api/internal/admin/tables` → Find a writable table
3. Get a record ID from query results
4. Call `POST /api/internal/admin/update` with valid data
5. Try with read-only JWT → Expect 403
6. Try with non-writable table → Expect 403

**Expected Outcome**: Admin WRITE privilege can update writable tables only.

---

### Scenario 13: GDPR Admin Monitoring

**Steps**:

1. Call `GET /api/internal/gdpr/requests?status=COMPLETED&limit=5`
2. Note request IDs and counts
3. Call `GET /api/internal/gdpr/metrics` → Compare totals
4. Get a specific request ID
5. Call `GET /api/internal/gdpr/requests/:id` → Verify details match

**Expected Outcome**: Admin can monitor all GDPR requests system-wide.

---

### Scenario 14: Cleanup Job Execution

**Steps**:

1. Call `GET /api/internal/admin/cleanup/jobs` → List available jobs
2. Call `POST /api/internal/admin/cleanup/run/expired-exports`
3. Verify response shows `recordsDeleted` count
4. Call `POST /api/internal/admin/cleanup/run-all`
5. Verify all jobs executed

**Expected Outcome**: Admin WRITE can trigger cleanup jobs manually.

---

## 10. Non-Goals

The following **CANNOT** be tested from the UI:

| Feature                     | Reason                               |
| --------------------------- | ------------------------------------ |
| Scheduler timing            | Fixed clock-time, no API control     |
| Database locks              | Internal implementation detail       |
| Cron job execution          | Runs automatically based on schedule |
| Email/push adapter behavior | Infrastructure implementation        |
| Retry queue processing      | Background processing                |
| Token cleanup timing        | Infrastructure maintenance           |

These are internal implementation details that should work transparently.

> **Note**: Internal admin console is now documented in Section 7 and can be tested.

---

## 11. Quick Reference

### Base URL

```
https://your-api-domain.com/api
```

### Public Endpoints

| Method | Path                   | Auth | Purpose                    |
| ------ | ---------------------- | ---- | -------------------------- |
| GET    | `/v1/public/bootstrap` | No   | Public app config          |
| POST   | `/v1/bootstrap`        | Yes  | Authenticated user startup |
| GET    | `/v1/health`           | No   | Liveness check             |
| GET    | `/v1/health/detailed`  | No   | Readiness check            |

### User Endpoints

| Method | Path                                         | Auth | Purpose                     |
| ------ | -------------------------------------------- | ---- | --------------------------- |
| GET    | `/v1/profiles/me`                            | Yes  | Get profile                 |
| POST   | `/v1/profiles/me`                            | Yes  | Create profile              |
| PATCH  | `/v1/profiles/me`                            | Yes  | Update profile              |
| GET    | `/v1/notifications`                          | Yes  | List notifications          |
| GET    | `/v1/notifications/unread-exists`            | Yes  | Check unread                |
| POST   | `/v1/notifications/:id/read`                 | Yes  | Mark as read                |
| POST   | `/v1/notifications/read-all`                 | Yes  | Mark all read               |
| GET    | `/v1/notification-profile`                   | Yes  | Get notification profile    |
| PUT    | `/v1/notification-profile`                   | Yes  | Update notification profile |
| POST   | `/v1/notification-profile/email`             | Yes  | Add/update email channel    |
| PUT    | `/v1/notification-profile/email/:id/enabled` | Yes  | Toggle email channel        |
| DELETE | `/v1/notification-profile/email/:id`         | Yes  | Remove email channel        |
| POST   | `/v1/notification-profile/push`              | Yes  | Register push token         |
| DELETE | `/v1/notification-profile/push/:id`          | Yes  | Remove push channel         |
| POST   | `/v1/gdpr/export`                            | Yes  | Request GDPR data export    |
| GET    | `/v1/gdpr/exports/:id`                       | Yes  | Export status               |
| GET    | `/v1/gdpr/exports/:id/download`              | Yes  | Download export             |
| POST   | `/v1/gdpr/delete`                            | Yes  | Request deletion            |
| POST   | `/v1/gdpr/suspend`                           | Yes  | Request suspension          |
| POST   | `/v1/gdpr/recover`                           | Yes  | Recover account             |

### Internal Admin Endpoints

> **Auth**: Requires admin JWT with `internal_admin: true`

| Method | Path                                | Privilege   | Purpose              |
| ------ | ----------------------------------- | ----------- | -------------------- |
| GET    | `/internal/admin/health`            | ADMIN_READ  | Admin health check   |
| GET    | `/internal/admin/tables`            | ADMIN_READ  | List visible tables  |
| GET    | `/internal/admin/query`             | ADMIN_READ  | Query table records  |
| GET    | `/internal/admin/record/:table/:id` | ADMIN_READ  | Get single record    |
| POST   | `/internal/admin/update`            | ADMIN_WRITE | Update record        |
| GET    | `/internal/admin/cleanup/jobs`      | ADMIN_READ  | List cleanup jobs    |
| POST   | `/internal/admin/cleanup/run-all`   | ADMIN_WRITE | Run all cleanups     |
| POST   | `/internal/admin/cleanup/run/:job`  | ADMIN_WRITE | Run specific cleanup |
| GET    | `/internal/admin/gdpr/coverage`     | ADMIN_READ  | GDPR table coverage  |
| GET    | `/internal/admin/gdpr/warnings`     | ADMIN_READ  | GDPR coverage gaps   |
| GET    | `/internal/gdpr/requests`           | ADMIN_READ  | List GDPR requests   |
| GET    | `/internal/gdpr/requests/:id`       | ADMIN_READ  | Get GDPR request     |
| GET    | `/internal/gdpr/metrics`            | ADMIN_READ  | GDPR metrics         |

