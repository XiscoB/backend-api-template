> Documentation Layer: Canonical Contract

# Authorization Flow - Internal Admin Console

**Single Source of Truth: Supabase JWT `app_metadata`**

---

## Authorization Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ 1️⃣  ENV Feature Gate Check                                      │
│     ┌──────────────────────────────────────┐                    │
│     │ ADMIN_CONSOLE_ENABLED=true?          │                    │
│     └──────────────┬───────────────────────┘                    │
│                    ├─ NO ──► Module Not Loaded (404)            │
│                    └─ YES ──► Continue                           │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2️⃣  JWT Signature Validation (Global JwtAuthGuard)              │
│     ┌──────────────────────────────────────┐                    │
│     │ Validates JWT via JWKS or secret     │                    │
│     └──────────────┬───────────────────────┘                    │
│                    ├─ INVALID ──► 401 Unauthorized              │
│                    └─ VALID ──► Extract Claims                  │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3️⃣  JwtStrategy: Extract app_metadata                           │
│     ┌──────────────────────────────────────┐                    │
│     │ app_metadata.internal_admin          │ ◄─── PRIMARY       │
│     │ app_metadata.internal_admin_level    │ ◄─── PRIMARY       │
│     └──────────────┬───────────────────────┘                    │
│                    └─ Attach to AuthenticatedUser              │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4️⃣  AdminPrivilegeGuard: Derive Privilege                       │
│                                                                  │
│     Priority 1: app_metadata (PRIMARY)                          │
│     ┌──────────────────────────────────────┐                    │
│     │ internal_admin = true?               │                    │
│     └──────────────┬───────────────────────┘                    │
│                    ├─ NO ──► Check Priority 2 (legacy roles)    │
│                    └─ YES ──► Derive privilege:                 │
│                               'write' → ADMIN_WRITE             │
│                               'read'  → ADMIN_READ              │
│                                     │                            │
│     Priority 2: JWT roles (LEGACY)                              │
│     ┌──────────────────────────────────────┐                    │
│     │ roles contains ADMIN_WRITE/READ?     │                    │
│     └──────────────┬───────────────────────┘                    │
│                    ├─ NO ──► 403 Forbidden                      │
│                    └─ YES ──► Grant privilege                   │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5️⃣  Optional ENV Deny-List (DENY ONLY)                          │
│     ┌──────────────────────────────────────┐                    │
│     │ ADMIN_USER_IDS configured?           │                    │
│     └──────────────┬───────────────────────┘                    │
│                    ├─ NO (empty) ──► Skip check                 │
│                    └─ YES ──► user.sub in list?                 │
│                               ├─ NOT IN ──► 403 Forbidden       │
│                               └─ IN LIST ──► Continue           │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6️⃣  Controller-Level Enforcement                                │
│     ┌──────────────────────────────────────┐                    │
│     │ @AdminReadOnly() → Requires READ     │                    │
│     │ @AdminWriteRequired() → Requires WRITE│                   │
│     └──────────────┬───────────────────────┘                    │
│                    ├─ Insufficient ──► 403                      │
│                    └─ Sufficient ──► Execute + Audit Log        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Principles

1. **JWT is authority** - Privileges come from `app_metadata` only
2. **ENV never grants** - `ADMIN_USER_IDS` can only deny
3. **Explicit derivation** - No implicit grants or magic
4. **Default-deny** - No privilege = no access

---

## Supabase JWT Structure

```json
{
  "sub": "user-id-12345",
  "email": "admin@example.com",
  "app_metadata": {
    "internal_admin": true,
    "internal_admin_level": "write"
  }
}
```

**Privilege Mapping:**

- `internal_admin=false` → No privilege (403)
- `internal_admin=true, level="read"` → ADMIN_READ
- `internal_admin=true, level="write"` → ADMIN_WRITE
- `internal_admin=true, level=undefined` → ADMIN_READ (default)

---

## ENV Configuration

### ADMIN_CONSOLE_ENABLED

- **Type:** Feature gate
- **Values:** `"true"` | `"false"`
- **Behavior:** Module loaded only if `"true"`

### ADMIN_USER_IDS

- **Type:** Optional deny-list
- **Values:** Comma-separated user IDs
- **Behavior:** If set, ONLY listed users allowed (requires restart)

⚠️ **ENV allowlist can ONLY deny, never grant. Privileges must come from JWT.**

---

## Granting Admin Access

```sql
-- In Supabase SQL Editor
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data ||
  '{"internal_admin": true, "internal_admin_level": "write"}'::jsonb
WHERE email = 'admin@example.com';
```

---

## Future Note: Audit Logs

**Current:** Admin actions logged to `gdpr_audit_logs`  
**Future:** Create dedicated `audit_logs` table  
**Action:** Document-only, no implementation yet

---

## Related Docs

- [INTERNAL_ADMIN_CONSOLE.md](INTERNAL_ADMIN_CONSOLE.md) - Full guide
- [ADMIN_CONSOLE_IMPLEMENTATION_SUMMARY.md](ADMIN_CONSOLE_IMPLEMENTATION_SUMMARY.md) - Implementation details

