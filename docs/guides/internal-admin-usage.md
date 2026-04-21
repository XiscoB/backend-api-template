> Documentation Layer: Operational Guide

# Internal Admin Console Usage Guide

This document explains how to use the Internal Admin Console for operational interventions.

> ⚠️ **WARNING**: The admin console is for rare operational use only. Disable it in production unless absolutely necessary.

## Table of Contents

- [Overview](#overview)
- [Enabling the Admin Console](#enabling-the-admin-console)
- [Authentication](#authentication)
- [Using the Browser Viewer](#using-the-browser-viewer)
- [Using the CLI Helper](#using-the-cli-helper)
- [Available Commands](#available-commands)
- [Examples](#examples)
- [Security Reminders](#security-reminders)
- [Disabling After Use](#disabling-after-use)

---

## Overview

The Internal Admin Console provides controlled access to database tables for operational interventions such as:

- Viewing records for debugging
- Manually correcting data
- Incident response

**Key constraints:**

- Environment-gated (requires restart to enable/disable)
- Requires JWT with `ADMIN_READ` or `ADMIN_WRITE` privilege
- Only allowlisted tables are accessible
- No bulk operations, no deletes
- Strict rate limiting (10 requests/60s)

---

## Enabling the Admin Console

### 1. Set the Environment Variable

```bash
# Unix/Linux/macOS
export ADMIN_CONSOLE_ENABLED=true

# Windows PowerShell
$env:ADMIN_CONSOLE_ENABLED = "true"

# Or in your .env file
ADMIN_CONSOLE_ENABLED=true
```

### 2. Restart the Backend

The admin console is only mounted at startup. You must restart the backend for changes to take effect.

```bash
npm run start:dev
# or
npm run start
```

### 3. Verify Enablement

On startup, you should see:

```
⚠️  INTERNAL ADMIN CONSOLE ENABLED
    Path: http://localhost:3000/internal/admin
```

---

## Authentication

### Getting an Admin JWT

You need a JWT with admin privileges. The token must include one of:

- `ADMIN_READ` — Read-only access
- `ADMIN_WRITE` — Read + limited write access

The role must be in one of these JWT claim locations:

- `app_metadata.roles` (Supabase/Auth0)
- `user_metadata.roles` (Supabase)
- `realm_access.roles` (Keycloak)
- `roles` (generic OIDC)

### Setting Up Your Environment

```bash
# Unix/Linux/macOS
export ADMIN_JWT="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export ADMIN_API_URL="http://localhost:3000/internal/admin"  # Optional, this is the default

# Windows PowerShell
$env:ADMIN_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
$env:ADMIN_API_URL = "http://localhost:3000/internal/admin"  # Optional
```

---

## Using the Browser Viewer

The Internal Admin Console includes a **read-only browser-based viewer** for non-technical team members who need to inspect data without using the command line.

### Accessing the Viewer

When the admin console is enabled, the viewer is available at:

```
http://localhost:3000/internal/admin/view/
```

On startup, you'll see both URLs logged:

```
⚠️  INTERNAL ADMIN CONSOLE ENABLED
    API:    http://localhost:3000/internal/admin
    Viewer: http://localhost:3000/internal/admin/view/
```

### Viewer Features

| Feature                | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| **JWT Authentication** | Paste your admin JWT to connect (kept in memory only)        |
| **Table List**         | Sidebar shows all visible tables (👁️ read-only, ✏️ writable) |
| **Paginated View**     | Browse records with 50 per page                              |
| **Record Detail**      | Click any row to view the full JSON                          |
| **Dark Mode**          | Dark theme for reduced eye strain                            |

### Security Notes

- **No persistence**: The JWT is stored in memory only. Refreshing the page logs you out.
- **Read-only**: The viewer only calls GET endpoints. No writes, no updates, no deletes.
- **Same guards**: All API calls go through the same authentication and rate limiting as the CLI.
- **No localStorage/cookies**: Nothing is saved to the browser.

### Quick Start

1. Navigate to `http://localhost:3000/internal/admin/view/`
2. Paste your admin JWT in the input field
3. Click "Connect"
4. Select a table from the sidebar
5. Browse records and click rows to view details

### Troubleshooting

| Error                      | Cause                           | Solution                                    |
| -------------------------- | ------------------------------- | ------------------------------------------- |
| "Invalid or expired token" | JWT has expired or is malformed | Get a fresh JWT from your identity provider |
| "Access denied"            | JWT lacks ADMIN_READ privilege  | Ensure your user has admin role assigned    |
| "Rate limit exceeded"      | Too many requests in 60s        | Wait before retrying (limit: 10 req/60s)    |
| "Resource not found"       | Table not in allowlist          | Check `VISIBLE_TABLES` in config            |

---

## Using the CLI Helper

The CLI helper is located at `scripts/internal-admin/`.

### Running Commands

**Unix/Linux/macOS:**

```bash
cd scripts/internal-admin
chmod +x admin.sh  # First time only
./admin.sh <command> [arguments]
```

**Windows PowerShell:**

```powershell
cd scripts\internal-admin
.\admin.ps1 <command> [arguments]
```

**Direct Node.js:**

```bash
node scripts/internal-admin/admin-cli.js <command> [arguments]
```

---

## Available Commands

### `tables` — List Visible Tables

Shows all tables accessible via the admin console.

```bash
./admin.sh tables
```

Output:

```
📋 Fetching visible tables...

Visible Tables:
──────────────────────────────────────────────────
  profiles                            👁️  (read-only)
  notifications                       ✏️  (writable)
  gdpr_export_requests                👁️  (read-only)
──────────────────────────────────────────────────
Total: 3 tables
```

### `query <table>` — Query Table Records

Retrieves records from a table with optional pagination and filtering.

```bash
./admin.sh query profiles --limit 10 --offset 0
./admin.sh query notifications --filter userId --value "user-123"
```

**Options:**

| Option             | Description           | Default |
| ------------------ | --------------------- | ------- |
| `--limit <n>`      | Max records to return | 50      |
| `--offset <n>`     | Skip first n records  | 0       |
| `--filter <field>` | Field to filter by    | —       |
| `--value <value>`  | Value to filter by    | —       |

### `get <table> <id>` — Get Single Record

Retrieves a single record by its ID.

```bash
./admin.sh get profiles abc-123-def-456
```

### `update <table> <id> <json>` — Update Record

Updates a single record. **Requires `ADMIN_WRITE` privilege.**

```bash
./admin.sh update notifications abc-123 '{"isRead": true}'
```

**Restrictions:**

- Only tables in `WRITABLE_TABLES` can be updated
- Protected fields cannot be updated: `id`, `createdAt`, `externalUserId`, `sub`
- No bulk operations
- No deletes

### `health` — Check Admin Console Health

Verifies the admin console is accessible and shows your privilege level.

```bash
./admin.sh health
```

Output:

```
🏥 Checking admin console health...

Admin Console Status:
──────────────────────────────────────────────────
  Status:     ✅ OK
  Privilege:  ADMIN_WRITE
  Timestamp:  2025-12-31T12:00:00.000Z
──────────────────────────────────────────────────
```

---

## Examples

### Scenario: View Recent Profiles

```bash
./admin.sh query profiles --limit 5
```

### Scenario: Find Notification by User

```bash
./admin.sh query notifications --filter userId --value "abc-123"
```

### Scenario: Mark Notification as Read

```bash
# First, find the notification ID
./admin.sh query notifications --filter userId --value "abc-123"

# Then update it
./admin.sh update notifications <notification-id> '{"isRead": true}'
```

### Scenario: View GDPR Export Requests

```bash
./admin.sh query gdpr_export_requests --limit 10
```

---

## Security Reminders

1. **Never commit tokens** — Keep `ADMIN_JWT` out of version control
2. **Use short-lived tokens** — Tokens should expire quickly
3. **Minimal privilege** — Use `ADMIN_READ` unless writes are needed
4. **Audit trail** — All operations are logged on the backend
5. **Rate limits apply** — 10 requests per 60 seconds maximum
6. **Allowlisted tables only** — Cannot access tables not in configuration

---

## Disabling After Use

When you're done with operational tasks, **disable the admin console**:

### 1. Remove or Unset the Environment Variable

```bash
# Unix/Linux/macOS
unset ADMIN_CONSOLE_ENABLED

# Windows PowerShell
Remove-Item Env:\ADMIN_CONSOLE_ENABLED

# Or in your .env file
ADMIN_CONSOLE_ENABLED=false
```

### 2. Restart the Backend

```bash
npm run start:dev
```

### 3. Verify Disabled

On startup, you should **NOT** see the admin console warning. The `/internal/admin` path should return 404.

---

## Configuration Reference

All admin console configuration is in:

```
src/modules/internal-admin/internal-admin.config.ts
```

To add/remove visible or writable tables, edit this file and restart the backend.

See [ADR 003: Internal Admin Console](adr/003-internal-admin-console.md) for architectural details.

