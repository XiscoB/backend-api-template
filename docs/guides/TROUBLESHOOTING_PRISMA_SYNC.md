> Documentation Layer: Operational Guide

# Troubleshooting: Prisma Schema Out of Sync

This guide explains how to fix TypeScript compilation errors when Prisma Client is out of sync with your schema.

---

## Problem

You see TypeScript errors like:

```
error TS2339: Property 'deliveryRetryQueue' does not exist on type 'PrismaService'.
error TS2339: Property 'schedulerLock' does not exist on type 'PrismaService'.
error TS2353: Object literal may only specify known properties, and 'isActive' does not exist in type 'UserPushChannelWhereInput'.
```

**Root Cause**: The Prisma Client code is outdated and doesn't match your current schema.

---

## Solution

### When Running Locally (Outside Docker)

```powershell
# Step 1: Regenerate Prisma Client
npm run prisma:generate

# Step 2: Rebuild TypeScript
npm run build
```

That's it! The Prisma Client will be regenerated from your schema.

---

### When Running in Docker

Docker builds cache layers, so the Prisma Client might be stale even after schema changes.

```powershell
# Step 1: Stop containers
docker-compose down

# Step 2: Rebuild WITHOUT cache (this is critical)
docker-compose build --no-cache

# Step 3: Start containers
docker-compose up -d

# Step 4: Verify compilation succeeded
docker logs backend-base-api --tail 50
```

**Why `--no-cache` is required:**

Docker caches the `npm install` and `prisma generate` layers. If you just run `docker-compose up --build`, it may reuse the cached Prisma Client from before your schema changes.

The `--no-cache` flag forces Docker to:

1. Re-copy the latest `prisma/schema.prisma`
2. Re-run `npx prisma generate` with the new schema
3. Ensure TypeScript sees the updated client

---

## Quick Reference Commands

| Scenario                    | Commands                                                                         |
| --------------------------- | -------------------------------------------------------------------------------- |
| **Local development**       | `npm run prisma:generate && npm run build`                                       |
| **Docker (quick rebuild)**  | `docker-compose down && docker-compose up --build`                               |
| **Docker (schema changed)** | `docker-compose down && docker-compose build --no-cache && docker-compose up -d` |
| **Check Docker logs**       | `docker logs backend-base-api --tail 50`                                         |

---

## When to Use Each Approach

### Use `npm run prisma:generate` when:

- Running locally (not in Docker)
- You modified `prisma/schema.prisma`
- You pulled changes that include schema updates

### Use `docker-compose build --no-cache` when:

- Running in Docker
- Schema changes aren't reflected after normal rebuild
- You see stale Prisma Client errors in Docker logs
- After pulling major schema updates from git

---

## Prevention Tips

1. **Always regenerate after schema changes:**

   ```powershell
   # After modifying schema.prisma
   npm run prisma:generate
   ```

2. **Commit `prisma/schema.prisma` changes carefully:**
   - Schema changes require all developers to regenerate
   - Document schema changes in commit messages
   - Consider running `prisma:generate` in your pre-commit hook

3. **Docker caching is aggressive:**
   - If unsure, use `--no-cache` to force full rebuild
   - The time cost is worth avoiding stale client issues

---

## Related Files

- **Schema Definition**: [`prisma/schema.prisma`](../prisma/schema.prisma)
- **Prisma Config**: [`prisma.config.ts`](../prisma.config.ts)
- **Dockerfile**: [`Dockerfile`](../Dockerfile) (line 19: `npx prisma generate`)

---

## Understanding the Flow

```
┌─────────────────────┐
│  schema.prisma      │  Your source of truth
└──────────┬──────────┘
           │
           │ prisma generate
           ▼
┌─────────────────────┐
│  @prisma/client     │  Generated TypeScript types
│  (node_modules)     │
└──────────┬──────────┘
           │
           │ imported by
           ▼
┌─────────────────────┐
│  PrismaService      │  Your application code
│  (TypeScript)       │
└─────────────────────┘
```

**The Problem**: If step 2 (prisma generate) doesn't run after schema changes, TypeScript still references the old client.

**The Solution**: Always regenerate the client after schema changes, and force Docker to do the same with `--no-cache`.

---

## Still Having Issues?

1. **Verify schema is valid:**

   ```powershell
   npm run prisma:validate
   ```

2. **Check Prisma Client version:**

   ```powershell
   npx prisma -v
   ```

3. **Clear node_modules (nuclear option):**

   ```powershell
   # Local
   Remove-Item -Recurse -Force node_modules
   npm install

   # Docker
   docker-compose down -v
   docker-compose build --no-cache
   docker-compose up -d
   ```

4. **Check for migration drift:**
   ```powershell
   npm run prisma:migrate:status
   ```

---

## Summary

**The #1 rule**: After changing `schema.prisma`, always run:

- **Locally**: `npm run prisma:generate`
- **Docker**: `docker-compose build --no-cache`

This ensures your Prisma Client matches your schema and prevents TypeScript compilation errors.

