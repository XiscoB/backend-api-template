> Documentation Layer: Operational Guide

# NPM Scripts Reference

This document explains all available npm scripts and when to use them.

---

## Quick Reference

| Task                 | Command                         | Safe? |
| -------------------- | ------------------------------- | ----- |
| Start development    | `npm run docker:up`             | ✅    |
| Apply schema changes | `npm run prisma:migrate`        | ✅    |
| Deploy to production | `npm run prisma:migrate:deploy` | ✅    |
| View database        | `npm run prisma:studio`         | ✅    |
| Restart container    | `npm run docker:restart`        | ✅    |

---

## Development Scripts

### `npm run start:dev`

Starts the NestJS server in watch mode (auto-reload on file changes).

- Use when running locally without Docker
- Requires `DATABASE_URL` to point to a running PostgreSQL

### `npm run docker:up`

Starts the full Docker environment (PostgreSQL + Backend).

- **Safe**: Does not delete any data
- Syncs JWT config from `.env` to Docker
- Applies pending migrations automatically
- Use `-d` at the end for detached mode: `npm run docker:up:detach`

### `npm run docker:down`

Stops Docker containers.

- **Safe**: Keeps all data (volumes preserved)
- Data will be there when you `docker:up` again

### `npm run docker:restart`

Restarts the backend container (picks up code changes).

- **Safe**: No data loss
- Faster than `docker:up` for quick restarts

### `npm run docker:logs`

Shows the last 50 lines of backend container logs.

---

## Database & Prisma Scripts

### `npm run prisma:generate`

Regenerates the Prisma TypeScript client.

- **Safe**: Never touches the database
- Run after: Changing `schema.prisma`
- Automatically runs on `npm install` (postinstall hook)

### `npm run prisma:migrate`

Creates AND applies a new migration.

- **Safe**: Adds changes, doesn't delete data
- Interactive: Prompts for migration name
- Use during development after schema changes

**Example workflow:**

```bash
# 1. Edit prisma/schema.prisma (add a field, table, etc.)
# 2. Create and apply migration
npm run prisma:migrate
# 3. Enter a name like "add_user_avatar_field"
```

### `npm run prisma:migrate:deploy`

Applies pending migrations to the database.

- **Safe**: Only applies migrations that haven't run yet
- Use in production/CI pipelines
- Non-interactive (no prompts)

### `npm run prisma:migrate:status`

Shows which migrations have been applied.

- **Safe**: Read-only, no changes
- Use to debug migration issues

### `npm run prisma:studio`

Opens Prisma Studio (database GUI) in your browser.

- **Safe**: Read-only by default
- Great for viewing and editing data
- Runs at http://localhost:5555

### `npm run prisma:validate`

Validates the Prisma schema syntax.

- **Safe**: No changes, just validation
- Run before committing schema changes

### `npm run prisma:format`

Formats the Prisma schema file.

- **Safe**: Only changes formatting

---

## Testing Scripts

### `npm run test`

Runs unit tests.

### `npm run test:e2e`

Runs end-to-end tests.

- Requires Docker to be running
- Tests actual HTTP endpoints

### `npm run test:cov`

Runs tests with coverage report.

---

## Build & Lint Scripts

### `npm run build`

Compiles TypeScript to JavaScript in `dist/`.

### `npm run lint`

Runs ESLint and auto-fixes issues.

### `npm run format`

Formats code with Prettier.

---

## Production Scripts

### `npm run start:prod`

Starts the production server.

- Runs the compiled JavaScript from `dist/`
- Does NOT apply migrations

### `npm run start:migrate`

Applies migrations and starts the production server.

- **Safe**: Only applies pending migrations
- **Recommended for cloud deployments** (Railway, Render, etc.)
- Runs: `prisma migrate deploy && node dist/main`

---

## Production Deployment

For detailed deployment instructions, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

### Quick Setup (Railway/Render)

| Setting           | Value                          |
| ----------------- | ------------------------------ |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start:migrate`        |

### Manual Deployment

```bash
# 1. Install dependencies (also runs prisma generate)
npm install

# 2. Build the application
npm run build

# 3. Apply migrations and start (single command)
npm run start:migrate
```

---

## Dangerous Commands (Removed)

The following commands were **intentionally removed** because they destroy data:

| Removed Command                        | What it did                             | Why removed                        |
| -------------------------------------- | --------------------------------------- | ---------------------------------- |
| `docker:reset`                         | Deleted all data and recreated database | Too easy to lose data accidentally |
| `reset` / `reset:local` / `reset:full` | Various destructive resets              | Data loss risk                     |

### If You Need a Fresh Database

If you intentionally want to start fresh (development only!):

```powershell
# ⚠️ WARNING: This DELETES ALL DATA
docker-compose down -v
docker-compose up --build -d
npm run prisma:migrate:deploy
```

Only do this when:

- Setting up a new development machine
- Testing migrations from scratch
- You explicitly want to lose all data

---

## Common Workflows

### I changed the Prisma schema

```bash
npm run prisma:migrate
# Enter a descriptive name like "add_email_to_profile"
```

### I changed application code (not schema)

```bash
npm run docker:restart
```

### I want to view/edit database data

```bash
npm run prisma:studio
```

### I need to check migration status

```bash
npm run prisma:migrate:status
```

### I'm deploying to production

```bash
npm install
npm run prisma:migrate:deploy
npm run start:prod
```

---

## Troubleshooting

### "Migration failed"

```bash
# Check what migrations have been applied
npm run prisma:migrate:status

# Check for schema errors
npm run prisma:validate
```

### "Container won't start"

```bash
# Check logs for errors
npm run docker:logs

# Try rebuilding
npm run docker:down
npm run docker:up
```

### "Prisma client outdated"

```bash
npm run prisma:generate
npm run docker:restart
```

---

## Infrastructure Maintenance Scripts

### `scripts/cleanup-cron.js`

**Purpose**: Trigger infrastructure cleanup jobs from external cron.

**What it does**:

- Calls the internal admin cleanup endpoint
- Runs all registered cleanup jobs (audit logs, delivery logs, etc.)
- Reports results and errors

**Prerequisites**:

- Backend API running
- Admin console enabled (`ADMIN_CONSOLE_ENABLED=true`)
- Valid JWT with `ADMIN_WRITE` privilege

**Usage**:

```bash
# Set your admin JWT token
export ADMIN_JWT="your-jwt-token"

# Run cleanup
node scripts/cleanup-cron.js

# Or specify custom API URL
API_URL=https://api.example.com node scripts/cleanup-cron.js
```

**Example output**:

```
✅ Cleanup completed successfully

Total records deleted: 1250
Duration: 342ms

Job results:
  ✅ audit-log-cleanup: 800 record(s) deleted
     Metadata: {"retentionDays":90,"cutoffDate":"2025-10-06T00:00:00.000Z"}
  ✅ notification-delivery-cleanup: 350 record(s) deleted
  ✅ delivery-retry-cleanup: 75 record(s) deleted
  ✅ push-token-cleanup: 25 record(s) deleted
```

**Integration with external schedulers**:

Kubernetes CronJob:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: infra-cleanup
spec:
  schedule: '0 2 * * *' # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: cleanup
              image: node:20-alpine
              command:
                - node
                - /scripts/cleanup-cron.js
              env:
                - name: API_URL
                  value: 'http://backend-api:3000'
                - name: ADMIN_JWT
                  valueFrom:
                    secretKeyRef:
                      name: admin-secrets
                      key: jwt
          restartPolicy: OnFailure
```

AWS EventBridge + Lambda:

```javascript
// Lambda function triggered by EventBridge schedule
exports.handler = async (event) => {
  const response = await fetch(`${process.env.API_URL}/api/internal/admin/cleanup/run-all`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ADMIN_JWT}`,
      'Content-Type': 'application/json',
    },
  });

  return await response.json();
};
```

**See also**:

- [INFRA_CLEANUP_CRONS.md](INFRA_CLEANUP_CRONS.md) - Complete cleanup documentation
- [internal-admin-usage.md](internal-admin-usage.md) - Admin console usage

```

```

