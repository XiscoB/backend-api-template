# API Development

> **Scope**: Controllers, services, DTOs, versioning, security defaults.  
> **Parent**: [agents.md](../agents.md)

> This document defines domain-specific contracts and invariants.
> Agent behavior and process rules are defined exclusively in [AGENT_LAW.md](AGENT_LAW.md).

---

## ⚠️ Authoritative API Surface

**This document is the authoritative reference for all API endpoints.**

### Invariants

1. **Every endpoint** (new, modified, or removed) is reflected in this document
2. **Code and documentation are kept in sync** — a change without a doc update is incomplete

If the implementation differs from this document, **this document is authoritative** and the implementation should be corrected.

---

## Repository Structure

```
src/
 ├─ main.ts
 ├─ app.module.ts
 ├─ config/
 ├─ common/
 │   ├─ auth/           # JWT validation only
 │   ├─ guards/
 │   ├─ decorators/
 │   ├─ filters/
 │   ├─ interceptors/
 │   ├─ constants/
 │   ├─ prisma/
 │   └─ types/
 ├─ infrastructure/     # Optional: Redis, Email, Queue adapters
 │   ├─ redis/
 │   ├─ email/
 │   └─ queue/
 ├─ jobs/               # Optional: Scheduled tasks
 ├─ modules/
 │   └─ <domain>/
 │       ├─ v1/
 │       │   ├─ *.controller.ts
 │       │   └─ dto/
 │       ├─ *.service.ts
 │       ├─ *.repository.ts
 │       └─ *.module.ts
```

Structural constraints:

- Controllers live inside version folders (`v1`, `v2`, …)
- Services are **version‑agnostic**
- Shared logic lives in `common/`
- Domain modules live in `modules/`
- Infrastructure adapters live in `infrastructure/` (optional)
- Scheduled jobs live in `jobs/` (optional)

---

## API Versioning Rules

- Global prefix: `/api`
- Versioned paths: `/api/v1`, `/api/v2`
- Versions represent **breaking contracts** only

Constraints:

- Max **2 active versions** at any time:
  - `current`
  - `supported`
- Deprecated versions are removed aggressively
- **Testing is done via environments, not versions**

---

## Controllers

- Handle HTTP only
- No business logic
- Always versioned (`v1/`, `v2/`)
- Thin — delegate to services

---

## Services

- Contain business logic
- Version‑agnostic
- May use repositories for data access

---

## DTOs

- DTOs are mandatory for input and output
- Prisma models are **never** returned directly
- Validation uses `class-validator`

---

## Security Defaults

Security is **on by default** and is not optional.

Expected baseline:

- Global validation pipe (whitelist: true, forbidNonWhitelisted: true)
- DTO‑based validation
- JWT guards (global, with `@Public()` decorator for exceptions)
- Rate limiting
- Explicit error handling
- CORS per environment
- Body size limits

---

## Translations

All user-facing strings (notifications, admin UI, GDPR exports) come from the global translations files.
Hardcoded English strings are not permitted.

Translation happens at the service layer.
DB values and API contracts remain language-agnostic.

---

## Public Endpoints (No Authentication)

### `GET /api/v1/public/bootstrap`

**Purpose**: Public client bootstrap configuration for app initialization.

**Authentication**: None (public)

**Caching**: Response is cacheable. `Cache-Control: public, max-age=3600`

**Rate Limit**: `rl-public-flexible` (300 req / 60s)

**Contract constraints**:

- This endpoint does not inspect JWTs
- This endpoint does not return user or identity data
- This endpoint does not perform suspension checks

**Response**:

```json
{
  "updatePolicy": {
    "ios": {
      "minimumVersion": "1.0.0",
      "forceUpdate": false,
      "messages": [
        { "language": "en", "title": "Update Available", "body": "..." }
      ]
    },
    "android": { "minimumVersion": "1.0.0", "forceUpdate": false, "messages": [...] },
    "web": { "minimumVersion": "1.0.0", "forceUpdate": false, "messages": [...] }
  },
  "metadata": {
    "apiVersion": "0.1.0",
    "policiesVersion": "1.0.0",
    "branding": { "companyName": "...", "supportEmail": "..." }
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

**Contract invariants**:

- Top-level keys: `updatePolicy`, `metadata`, `features`, `i18n` (no others permitted)
- EN always exists as a fallback in `messages` arrays
- No per-user data, no secrets, no auth tokens

---

### `POST /api/v1/bootstrap`

**Purpose**: Authenticated user startup context. **MANDATORY first call after login.**

**Authentication**: Required (USER or ENTITY role)

**Response** (ACTIVE user):

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

**Response** (SUSPENDED user):

```json
{
  "identity": {
    "status": "SUSPENDED",
    "recoveryAvailable": true
  }
}
```

**Identity Status Values**:

- `ACTIVE` - Normal, fully functional account
- `SUSPENDED` - Account is suspended (Right to Restriction)
- `DELETED` - Account permanently deleted (anonymized)
- `PENDING_RECOVERY` - Suspended but recovery is available

**Contract invariants**:

- This is a UX gate, not a security gate (guards still enforce access)
- No app-level config (use public bootstrap for that)
- No duplication of public bootstrap data

---

### `GET /api/v1/health`

**Purpose**: Basic liveness probe.

**Authentication**: None (public)

**Response**: `{ "status": "ok" }`

---

### `GET /api/v1/health/detailed`

**Purpose**: Detailed health check for readiness probes and monitoring.

**Authentication**: None (public)

**Response**:

```json
{
  "status": "healthy",
  "components": {
    "database": { "status": "healthy", "latencyMs": 5 }
  },
  "timestamp": "2026-01-11T12:00:00.000Z"
}
```

---

## Authenticated Endpoints (JWT Required)

### Profiles

#### `GET /api/v1/profiles/me`

**Purpose**: Get current user's profile.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Response**:

```json
{
  "id": "uuid",
  "identityId": "uuid",
  "displayName": "string | null",
  "language": "en",
  "avatarUrl": "string | null",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

**Errors**: `404` if profile not found

---

#### `POST /api/v1/profiles/me`

**Purpose**: Create profile for current user (idempotent).

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Request Body**:

```json
{
  "displayName": "string (optional)",
  "language": "en (optional, defaults to 'en')"
}
```

**Response**: Same as GET, returns `200` (not 201 — idempotent)

---

#### `PATCH /api/v1/profiles/me`

**Purpose**: Partial update of current user's profile.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Request Body** (all fields optional):

```json
{
  "displayName": "string",
  "language": "es",
  "avatarUrl": "string"
}
```

**Response**: Same as GET

**Errors**: `404` if profile not found

---

### Notifications

#### `GET /api/v1/notifications`

**Purpose**: List notifications for current user.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Query Parameters**:

- `take`: Max results (default 50)
- `skip`: Pagination offset (default 0)

**Response**: Array of notification objects

---

#### `GET /api/v1/notifications/unread-exists`

**Purpose**: Fast check if user has unread notifications (O(1) query).

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Response**: `{ "hasUnread": true | false }`

---

#### `POST /api/v1/notifications/:id/read`

**Purpose**: Mark a specific notification as read.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Response**: Updated notification object

**Errors**: `404` if notification not found or not owned by user

---

#### `POST /api/v1/notifications/read-all`

**Purpose**: Mark all notifications as read.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Response**: `{ "markedCount": number }`

---

### Notification Profile & Channels

#### `GET /api/v1/notification-profile`

**Purpose**: Get notification profile with all channels.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Response**: Profile with email and push channels

---

#### `PUT /api/v1/notification-profile`

**Purpose**: Update notification profile settings.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

---

#### `POST /api/v1/notification-profile/email`

**Purpose**: Add or update an email channel.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

---

#### `PUT /api/v1/notification-profile/email/:id/enabled`

**Purpose**: Enable/disable an email channel.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

---

#### `DELETE /api/v1/notification-profile/email/:id`

**Purpose**: Remove an email channel.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

---

#### `POST /api/v1/notification-profile/push`

**Purpose**: Register or rotate a push token.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

---

#### `DELETE /api/v1/notification-profile/push/:id`

**Purpose**: Deactivate and remove a push channel.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

---

### GDPR (User-Facing)

#### `POST /api/v1/gdpr/export`

**Purpose**: Request a GDPR data export (async).

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Response**: `202 Accepted` with request ID

**Errors**: `409` if pending request exists

---

#### `GET /api/v1/gdpr/exports/:requestId`

**Purpose**: Get export status.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Errors**: `403` if not owner, `404` if not found

---

#### `GET /api/v1/gdpr/exports/:requestId/download`

**Purpose**: Get presigned download URL for completed export.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Errors**: `403` if not owner, `404` if not ready, `410` if expired

---

#### `POST /api/v1/gdpr/delete`

**Purpose**: Request permanent data deletion (async).

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Response**: `202 Accepted` with request ID

---

#### `POST /api/v1/gdpr/suspend`

**Purpose**: Request account suspension (reversible, async).

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Response**: `202 Accepted` with request ID

---

#### `POST /api/v1/gdpr/recover`

**Purpose**: Recover suspended account.

**Authentication**: JWT required

**Roles**: `USER`, `ENTITY`

**Errors**: `404` if no suspension, `403` if recovery not allowed

---

## Internal Admin Endpoints (Admin JWT Required)

All internal admin endpoints require:

- Valid JWT
- Admin privileges (checked by `AdminPrivilegeGuard`)
- Routes are at `/api/internal/admin/*` and `/api/internal/gdpr/*`

### Admin Console

| Method | Path                                    | Privilege | Purpose              |
| ------ | --------------------------------------- | --------- | -------------------- |
| GET    | `/api/internal/admin/tables`            | READ      | List visible tables  |
| GET    | `/api/internal/admin/query`             | READ      | Query table records  |
| GET    | `/api/internal/admin/record/:table/:id` | READ      | Get single record    |
| POST   | `/api/internal/admin/update`            | WRITE     | Update a record      |
| GET    | `/api/internal/admin/health`            | READ      | Admin health check   |
| GET    | `/api/internal/admin/cleanup/jobs`      | READ      | List cleanup jobs    |
| POST   | `/api/internal/admin/cleanup/run-all`   | WRITE     | Run all cleanups     |
| POST   | `/api/internal/admin/cleanup/run/:job`  | WRITE     | Run specific cleanup |
| GET    | `/api/internal/admin/gdpr/coverage`     | READ      | GDPR table coverage  |
| GET    | `/api/internal/admin/gdpr/warnings`     | READ      | GDPR coverage gaps   |

### GDPR Admin

| Method | Path                              | Privilege | Purpose            |
| ------ | --------------------------------- | --------- | ------------------ |
| GET    | `/api/internal/gdpr/requests`     | READ      | List GDPR requests |
| GET    | `/api/internal/gdpr/requests/:id` | READ      | Get single request |
| GET    | `/api/internal/gdpr/metrics`      | READ      | GDPR metrics       |
