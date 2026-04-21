# Supabase Internal Admin Authorization

This document describes the **authoritative way** internal admin access is managed
using **Supabase Auth + JWT app_metadata**.

This replaces any previous Keycloak-based role system.

---

## Purpose

- Control access to the **Internal Admin Console**
- Avoid hardcoded user IDs in backend code
- Keep authorization centralized, auditable, and signed
- Prevent backend services from mutating auth data

This is **internal operational tooling**, not product authorization.

---

## Core Principles

1. **JWT is the single source of truth for privileges**
2. **Supabase `app_metadata` is trusted**
3. **`user_metadata` is NOT trusted**
4. **Backend never modifies Supabase users**
5. **ENV variables never grant privileges**

---

## Admin Claims (JWT Contract)

Admin access is defined via **Supabase `app_metadata`**.

### Required Claims

```json
{
  "internal_admin": true,
  "internal_admin_level": "read" | "write"
}
```

### Meaning

| Field                  | Description                         |
| ---------------------- | ----------------------------------- |
| `internal_admin`       | Enables access to admin console     |
| `internal_admin_level` | Privilege level (`read` or `write`) |

These values are:

- Set **manually** by project administrators
- Stored in `auth.users.raw_app_meta_data`
- Signed into the JWT access token

---

## Privilege Derivation (Backend)

The backend derives **internal privileges**, not roles.

```ts
if (!jwt.app_metadata?.internal_admin) {
  deny();
}

if (jwt.app_metadata.internal_admin_level === 'write') {
  ADMIN_WRITE;
} else {
  ADMIN_READ;
}
```

### Notes

- `ADMIN_READ` / `ADMIN_WRITE` are **derived privileges**
- They are **not roles**
- They do not exist in Supabase

---

## How to Grant Admin Access (Step-by-Step)

### 1. Open Supabase Dashboard

- Go to **Authentication → Users**
- Identify the user by email

### 2. Use SQL Editor (UI is read-only)

Supabase does **not** allow editing `app_metadata` from the Users UI.

Go to **SQL Editor** and run:

#### Grant WRITE admin

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'internal_admin', true,
  'internal_admin_level', 'write'
)
where id = '<USER_UUID>';
```

#### Grant READ admin

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'internal_admin', true,
  'internal_admin_level', 'read'
)
where id = '<USER_UUID>';
```

### 3. Verify

```sql
select id, email, raw_app_meta_data
from auth.users
where raw_app_meta_data ? 'internal_admin';
```

---

## JWT Refresh Requirement

JWTs are issued at **login time**.

After changing `app_metadata`:

1. User must log out
2. User must log back in
3. Backend will then see updated claims

---

## Environment Variables (Allowed Usage)

ENV variables may only **gate or restrict** access.

```env
ADMIN_CONSOLE_ENABLED=true
ADMIN_ALLOWED_USER_IDS=optional,deny,list
```

### Rules

- ENV variables **MUST NOT grant privileges**
- ENV allowlists may only **deny** access
- JWT always decides privilege level

---

## Explicitly Forbidden

❌ Hardcoding admin user IDs in backend logic  
❌ Using `user_metadata` for authorization  
❌ Backend mutating Supabase users  
❌ Using Supabase `role` claim (`authenticated`, etc.)  
❌ Granting privileges via ENV variables

---

## Rationale

This approach ensures:

- Signed, tamper-proof privileges
- Centralized admin control
- No backend redeploys to change admins
- Full auditability via database + JWT
- Clear separation of concerns

This is the **only supported admin authorization model**.
