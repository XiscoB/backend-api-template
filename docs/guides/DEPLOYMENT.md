> Documentation Layer: Operational Guide

# Deployment Guide

This guide covers deploying the backend to Railway, Render, or similar cloud platforms.

---

## Quick Setup (Railway)

| Setting           | Value                          |
| ----------------- | ------------------------------ |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start:migrate`        |

That's it! Railway handles the rest automatically.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  AUTOMATIC DEPLOY FLOW (on every git push)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Pull code from GitHub                                   │
│                           ↓                                 │
│  2. npm install                                             │
│     • Installs dependencies                                 │
│     • Runs prisma generate (postinstall hook)               │
│                           ↓                                 │
│  3. npm run build                                           │
│     • Compiles TypeScript to JavaScript                     │
│                           ↓                                 │
│  4. npm run start:migrate                                   │
│     • prisma migrate deploy (applies pending migrations)    │
│     • node dist/main (starts the server)                    │
│                                                             │
│  ✅ Your app is live with latest schema!                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

Set these in your cloud platform's dashboard:

### Required

| Variable       | Description                  | Example                               |
| -------------- | ---------------------------- | ------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_ISSUER`   | Your Supabase project URL    | `https://abc123.supabase.co/auth/v1`  |
| `JWT_AUDIENCE` | JWT audience claim           | `authenticated`                       |
| `NODE_ENV`     | Environment mode             | `production`                          |

### Authentication (choose one)

| Variable         | When to use                            |
| ---------------- | -------------------------------------- |
| `JWT_SECRET`     | Supabase with HS256 algorithm          |
| `JWT_PUBLIC_KEY` | RS256 with static public key           |
| `JWT_JWKS_URI`   | RS256 with JWKS endpoint (recommended) |

### For Supabase (typical setup)

```env
DATABASE_URL=postgresql://postgres:password@db.abc123.supabase.co:5432/postgres
JWT_ISSUER=https://abc123.supabase.co/auth/v1
JWT_AUDIENCE=authenticated
JWT_JWKS_URI=https://abc123.supabase.co/auth/v1/.well-known/jwks.json
NODE_ENV=production
```

---

## Database Migrations

### What happens automatically

Every deploy runs `prisma migrate deploy` which:

- ✅ Applies only NEW migrations (ones that haven't run yet)
- ✅ Tracks which migrations have been applied
- ✅ Never deletes data or drops tables
- ✅ Is idempotent (safe to run multiple times)

### First deploy

All migrations run in order:

```
Applying migration 20251226121338_init
Applying migration 20251227_add_gdpr_tables
Applying migration 20251228_00_add_gdpr_suspension
... (all migrations)
```

### Subsequent deploys

Only new migrations run:

```
1 migration found in prisma/migrations
Already applied: 20251226121338_init (and 8 others)
Applying migration 20260115_add_new_feature  ← Only this one
```

If no new migrations exist:

```
No pending migrations to apply.
```

---

## Platform-Specific Setup

### Railway

1. Create a new project in Railway
2. Add a PostgreSQL database (Railway provides one)
3. Connect your GitHub repository
4. Set environment variables in the Variables tab
5. Configure build/start commands in Settings:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:migrate`
6. Deploy!

Railway automatically:

- Detects Node.js project
- Provides `DATABASE_URL` for the Railway PostgreSQL
- Redeploys on every push to main branch

### Render

1. Create a new Web Service
2. Connect your GitHub repository
3. Set:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:migrate`
4. Add a PostgreSQL database
5. Set environment variables
6. Deploy!

### Fly.io

1. Install flyctl: `brew install flyctl`
2. Initialize: `fly launch`
3. Create Postgres: `fly postgres create`
4. Attach to app: `fly postgres attach`
5. Set secrets:
   ```bash
   fly secrets set JWT_ISSUER=https://...
   fly secrets set JWT_AUDIENCE=authenticated
   fly secrets set JWT_JWKS_URI=https://...
   ```
6. Deploy: `fly deploy`

---

## Your Development Workflow

```
┌──────────────────────────────────────────────────────────────┐
│  DAILY WORKFLOW                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  LOCAL (your machine):                                       │
│                                                              │
│  1. Make code changes                                        │
│                                                              │
│  2. If you changed schema.prisma:                            │
│     npm run prisma:migrate                                   │
│     (creates migration file + applies locally)               │
│                                                              │
│  3. Test locally                                             │
│     npm run docker:up                                        │
│                                                              │
│  4. Commit and push                                          │
│     git add .                                                │
│     git commit -m "Add new feature"                          │
│     git push                                                 │
│                           ↓                                  │
│  CLOUD (automatic):                                          │
│                                                              │
│  5. Platform detects push                                    │
│  6. Builds your app                                          │
│  7. Runs migrations (prisma migrate deploy)                  │
│  8. Starts server                                            │
│                                                              │
│  ✅ Live in production!                                      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Migration failed on deploy

```bash
# Check migration status
npx prisma migrate status

# Check for schema drift
npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma
```

Common causes:

- Schema was modified directly in production (don't do this)
- Migration file was edited after being applied
- Database connection issues

### App crashes on start

Check logs for:

- Missing environment variables
- Database connection errors
- JWT configuration issues

### Database connection refused

Verify:

- `DATABASE_URL` is correct
- Database is running and accessible
- SSL settings (some providers require `?sslmode=require`)

---

## Health Check

Your app exposes a health endpoint for monitoring:

```
GET /api/v1/health
```

Response:

```json
{ "status": "ok" }
```

Configure this as your health check URL in Railway/Render.

---

## Zero-Downtime Deployments

Railway and Render support zero-downtime deployments:

1. New version starts in parallel
2. Health check passes
3. Traffic switches to new version
4. Old version shuts down

Migrations run during step 1, before traffic switches.

---

## Rollback

If something goes wrong:

### Code rollback

- Revert your commit in Git
- Push to trigger redeploy with previous code

### Database rollback

Prisma doesn't auto-rollback migrations. Options:

- Write a new migration to undo changes
- Restore from database backup (if available)

**Best practice**: Test migrations locally before pushing to production.

