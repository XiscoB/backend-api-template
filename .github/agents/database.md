# Database Rules

> **Scope**: Prisma ORM, schema design, migrations, table patterns.  
> **Parent**: [agents.md](../agents.md)  
> **Authoritative Reference**: `docs/create_tables_guideline.md`

> This document defines domain-specific contracts and invariants.
> Agent behavior and process rules are defined exclusively in [AGENT_LAW.md](AGENT_LAW.md).

---

## Prisma Configuration

- Prisma ORM 7.x is the required version
- Prisma is the only way to access the database
- No raw SQL unless explicitly approved
- This repository standardizes on the `prisma-client` generator
- Legacy `prisma-client-js` must not be used in this repo
- This repository requires a custom `output` path for Prisma Client
- All imports must use the configured generated path
- Driver adapters are required only for non-Node runtimes (Edge, Deno, Cloudflare)
- Standard Node.js backends may use the default PostgreSQL driver

---

## Table Design

All table creation and modification follows the guidelines defined in:

```
docs/create_tables_guideline.md
```

---

## Prisma 7 Schema Configuration

All Prisma schemas must use the following generator configuration:

```prisma
generator client {
  provider = "prisma-client"
  output   = "./generated/prisma"  // Required in Prisma 7
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Key Prisma 7 Requirements:**

- Use `prisma-client` provider (not `prisma-client-js`)
- `output` field is **mandatory in this repository**
- Client imports use custom path: `import { PrismaClient } from './generated/prisma/client'`
- Driver adapters are required only for non-Node runtimes (Edge, Deno, Cloudflare)
- Environment variables must be loaded explicitly (e.g., using `dotenv`)

---

## Prisma Configuration File

Prisma 7 introduces `prisma.config.ts` for project configuration:

```typescript
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
```

This configuration is recommended for Prisma 7 projects in this repository. If introduced, all contributors must follow it consistently.

This separates project configuration from the schema and provides better TypeScript support.

---

## Identity-First Pattern

All user-owned data must reference Identity:

```prisma
model Identity {
  id             String   @id @default(uuid())
  externalUserId String   @unique

  anonymized     Boolean  @default(false)
  isSuspended    Boolean  @default(false)
  isFlagged      Boolean  @default(false)
  lastActivity   DateTime?

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  profile        Profile?
}

model Profile {
  id         String   @id @default(uuid())
  identityId String   @unique
  identity   Identity @relation(fields: [identityId], references: [id])

  email      String   @unique
  name       String?

  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

Constraints:

- Domain tables reference `identityId`, never `externalUserId`
- **No auth‑related fields** (no passwords, tokens, sessions)
- No business logic inside Prisma schema
- Prisma models are **never returned directly** — use DTOs

---

## Schema Change Governance

Any change to a model in `schema.prisma` includes:

1. A corresponding Prisma migration (create or update)
2. A `prisma generate` step
3. Documentation of the change impact in code or docs

Schema changes are never isolated — downstream effects are always considered.

---

## Dead Schema Removal

Unused Prisma models that violate architecture boundaries are removed rather than future-proofed.

---

## Completeness Invariants for DB Changes

A table addition is complete only when all of the following hold:

- ✅ Prisma schema updated
- ✅ Migration exists
- ✅ GDPR classification is explicit (see `.github/agents/gdpr.md`)
- ✅ Table appears in internal/admin/view
- ✅ If personal data → included or excluded intentionally

---

## Environment Variables

| Variable       | Required | Description                  |
| -------------- | -------- | ---------------------------- |
| `DATABASE_URL` | Yes      | PostgreSQL connection string |
