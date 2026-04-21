> Documentation Layer: Canonical Contract

# Internal Admin Console

**Operational tooling for rare, manual database interventions.**

⚠️ This is NOT a product admin panel. This is infrastructure for ops/support teams.

---

## Overview

The Internal Admin Console provides controlled, read-only (with limited write) access to specific database tables for operational purposes.

**Key Features:**

- Environment-gated (restart-only, no runtime toggles)
- Hardcoded table allowlists (no dynamic discovery)
- User-based access control via JWT allowlist
- Strict rate limiting (10 requests/60 seconds)
- No bulk operations, no deletes
- Browser-based read-only UI
- CLI helper for quick operations

---

## Access Control

### Enabling the Console

Set in `.env`:

```bash
ADMIN_CONSOLE_ENABLED=true
```

Backend must be **restarted** for changes to take effect.

### Adding Admin Users

**Primary Method (Recommended): Supabase app_metadata**

Grant admin access via Supabase Auth JWT claims in `app_metadata`:

```sql
-- In Supabase SQL Editor or via Auth Admin API
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"internal_admin": true, "internal_admin_level": "write"}'::jsonb
WHERE id = 'user-id-here';
```

**JWT Claims:**

- `app_metadata.internal_admin`: `true` - Grants admin console access
- `app_metadata.internal_admin_level`: `'read'` or `'write'` - Controls privilege level

**Legacy Method: ENV allowlist (Deny-Only)**

```bash
# In .env
ADMIN_USER_IDS=user-id-1,user-id-2
```

⚠️ **IMPORTANT:** The ENV allowlist can ONLY deny access, never grant it.

- If set, users NOT in the list are denied even if JWT grants privilege
- If empty, no deny-list is applied
- Privileges MUST come from JWT claims (Supabase app_metadata or roles)

### Privilege Levels

| Privilege     | Access                                               |
| ------------- | ---------------------------------------------------- |
| `ADMIN_READ`  | Read-only access to visible tables                   |
| `ADMIN_WRITE` | Read + limited write (no deletes) on writable tables |

**Priority order for privilege determination:**

1. `ADMIN_USER_IDS` allowlist → grants `ADMIN_WRITE`
2. JWT `roles` claim (checks `ADMIN` or `SYSTEM` roles) → grants based on role
3. Default → access denied

---

## Configuration

All configuration is centralized in:

```
src/modules/internal-admin/internal-admin.config.ts
```

### Current Table Configuration

**VISIBLE** (read-only access):

- `profiles`
- `requests` (GDPR requests)
- `gdpr_audit_logs`
- `notification_logs`
- `scheduled_notifications`
- `user_notification_profiles`

**WRITABLE** (update allowed):

- `notification_logs` (marking as read/dismissed)

**Important:** Table names must match **Prisma model names** (snake_case database table names), not model class names.

### Adding New Tables

1. Edit `src/modules/internal-admin/internal-admin.config.ts`
2. Add table name to `TABLE_ACCESS.VISIBLE` array
3. Optionally add to `TABLE_ACCESS.WRITABLE` for write access
4. **Restart the backend** (no hot-reload)

Example:

```typescript
VISIBLE: [
  'profiles',
  'requests',
  'your_new_table', // Add here - must match Prisma @map name
] as const,
```

---

## Using the Console

### Browser UI

**URL:** `http://localhost:3000/internal/admin/view`

**Requirements:**

- Valid JWT token from your identity provider
- User ID (`sub`) in `ADMIN_USER_IDS` allowlist

**Features:**

1. Connect with JWT token (paste full token)
2. View list of accessible tables
3. Click table to view records (paginated, 50 per page)
4. Click record to view details
5. Disconnect button clears token from memory

**Token Storage:** JWT is stored in memory only (not localStorage). Refreshing the page requires reconnection.

### CLI Helper

**Location:** `scripts/internal-admin-cli.js`

**Usage:**

```bash
# PowerShell
.\scripts\internal-admin-cli.ps1 tables

# Bash/Linux
./scripts/internal-admin-cli.sh tables
```

**Available Commands:**

- `tables` - List accessible tables
- `query <table> [limit] [offset]` - Query table records
- `health` - Check admin console health

**Token:** Set `ADMIN_JWT_TOKEN` environment variable or pass via `--token` flag.

---

## API Endpoints

All endpoints require valid JWT with admin privileges.

**Base Path:** `/api/internal/admin`

| Endpoint                           | Method | Description                                     |
| ---------------------------------- | ------ | ----------------------------------------------- |
| `/health`                          | GET    | Health check + privilege info                   |
| `/tables`                          | GET    | List accessible tables                          |
| `/query?table=X&limit=50&offset=0` | GET    | Query table records                             |
| `/record/:table/:id`               | GET    | Get single record                               |
| `/update`                          | POST   | Update single record (write privilege required) |

**Rate Limit:** 10 requests per 60 seconds per user.

---

## Security Features

✅ **Environment-gated** - Requires restart to enable/disable

✅ **Default-deny** - Tables not in allowlist are inaccessible

✅ **No dynamic discovery** - Cannot list all database tables

✅ **User allowlist** - Only specific user IDs can access

✅ **JWT validation** - Full JWT signature verification via JWKS

✅ **Strict rate limiting** - 10 req/60s

✅ **No deletes** - Delete operations are disabled

✅ **No bulk operations** - One record at a time only

✅ **Audit logging** - Admin actions logged via NestJS logger

❌ **Not included:** Session management, refresh tokens, user management UI

---

## Architecture

### File Structure

```
src/modules/internal-admin/
├── internal-admin.config.ts          # Single source of truth
├── internal-admin.module.ts          # NestJS module
├── internal-admin.controller.ts      # API endpoints
├── internal-admin.service.ts         # Business logic
├── internal-admin.repository.ts      # Prisma queries
├── admin-privilege.guard.ts          # Access control
├── admin.decorators.ts               # @AdminReadOnly, @AdminWriteRequired
├── current-admin-user.decorator.ts   # @CurrentAdminUser()
├── admin.types.ts                    # Type definitions
├── dto/                              # Request/response DTOs
└── view/                             # Static browser UI
    ├── index.html
    ├── styles.css
    └── app.js
```

### Integration

The admin module is conditionally imported in `src/app.module.ts`:

```typescript
imports: [
  // ...other modules
  ...(process.env.ADMIN_CONSOLE_ENABLED === 'true' ? [InternalAdminModule] : []),
];
```

Static files are served in `src/main.ts` before NestJS routes:

```typescript
app.use('/internal/admin/view', express.static(viewPath));
```

### Response Format

Admin endpoints use `@SkipResponseWrap()` to prevent double-wrapping.

**Controller returns:**

```json
{
  "data": [...],
  "meta": { "total": 100, "limit": 50, "offset": 0 }
}
```

No additional wrapping by `ResponseTransformInterceptor`.

---

## Troubleshooting

### "HTTP 400 - Retry" on table

**Cause:** Table name in config doesn't match Prisma model's `@map` name.

**Fix:** Check `prisma/schema.prisma` for actual table name:

```prisma
model NotificationLog {
  // ...
  @@map("notification_logs")  // Use THIS name in config
}
```

### "Access denied" / 403 errors

**Cause:** User not in `ADMIN_USER_IDS` allowlist or missing admin role in JWT.

**Fix:**

1. Check JWT `sub` matches allowlist
2. Verify JWT has valid `roles` claim with `ADMIN` or `SYSTEM`
3. Check logs for debug output from `AdminPrivilegeGuard`

### Console not loading

**Cause:** `ADMIN_CONSOLE_ENABLED` not set or backend not restarted.

**Fix:**

1. Verify `.env` has `ADMIN_CONSOLE_ENABLED=true`
2. Restart backend: `docker-compose restart backend`
3. Check logs: `docker-compose logs backend | grep -i admin`

### Static files not updating

**Cause:** Docker image bakes files at build time.

**Fix:** Rebuild image:

```bash
docker-compose up -d --build backend
```

### Rate limit exceeded

**Cause:** More than 10 requests in 60 seconds.

**Fix:** Wait 60 seconds or restart backend to reset limits.

---

## Development

### Running Locally (Outside Docker)

If running backend on host machine (not Docker), database must be accessible at `localhost:5432`.

**Do NOT do this unless necessary.** Always prefer Docker Compose:

```bash
docker-compose up -d
```

### Debugging

Enable debug logging in `admin-privilege.guard.ts` (already enabled):

```typescript
this.logger.debug(`User ${userId} granted ${privilege} via allowlist`);
```

Check logs:

```bash
docker-compose logs backend -f | grep AdminPrivilege
```

### Testing

Manual testing only. No automated tests for admin console yet.

Test checklist:

- [ ] Connect with valid JWT
- [ ] View tables list
- [ ] Query each table
- [ ] View individual records
- [ ] Pagination works
- [ ] Rate limiting triggers at 11th request
- [ ] Disconnect clears token

---

## Limitations

**By design:**

- No authentication (uses external identity provider)
- No user management UI
- No session persistence (JWT in memory only)
- No bulk operations
- No delete operations
- No search/filtering (beyond basic pagination)
- No export functionality
- No audit trail UI (check logs)

**Technical:**

- Token must be manually pasted (no OAuth flow)
- Page refresh requires reconnection
- No real-time updates
- No optimistic UI updates
- Browser must support ES6+

---

## Future Considerations

**Do NOT implement without explicit approval:**

- ❌ Role-based table visibility
- ❌ Dynamic table discovery
- ❌ Bulk operations
- ❌ Delete operations
- ❌ File uploads
- ❌ Embedded identity provider
- ❌ User management
- ❌ Advanced filtering/search
- ❌ Data export (CSV, JSON)
- ❌ Audit trail UI

Keep it boring. Keep it simple.

---

## Summary

The Internal Admin Console is **minimal operational tooling**, not a product feature.

**Key principles:**

1. Restart-only configuration
2. Hardcoded allowlists
3. No dynamic behavior
4. No bulk operations
5. No deletes
6. External authentication only

For questions, see:

- `docs/canonical/AUTH_CONTRACT.md` - Authentication architecture
- `agents.md` - AI agent instructions
- `src/modules/internal-admin/internal-admin.config.ts` - Configuration reference

