# Prisma Upgrade Checklist

This checklist ensures safe Prisma upgrades and schema changes.

## 🚀 Quick Start (Automated Validation)

After any Prisma upgrade or schema change, run:

```bash
npm run db:verify
```

This validates:

- ✅ Schema syntax and formatting
- ✅ Database connectivity
- ✅ All models are accessible
- ✅ Migrations status
- ✅ Critical indexes
- ✅ Enum types
- ✅ Prisma Client version

## 📋 Prisma 7.x Breaking Changes (What We Fixed)

When upgrading from Prisma 5.x/6.x to 7.x, these changes were required:

### 1. **prisma.config.ts is Now Required**

Created `prisma.config.ts` at project root to configure CLI operations:

```typescript
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
  migrations: { path: 'prisma/migrations' },
});
```

### 2. **Removed `url` from schema.prisma**

The `datasource` block no longer supports `url` field:

```prisma
// ❌ OLD (Prisma 5/6)
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ✅ NEW (Prisma 7)
datasource db {
  provider = "postgresql"
  // URL now configured via prisma.config.ts
}
```

### 3. **Driver Adapters Required**

Prisma Client now requires database adapters:

**Installed:**

```bash
npm install @prisma/adapter-pg pg
```

**Updated PrismaService:**

```typescript
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000, // Match v6 defaults
  max: 10,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

### 4. **Explicit Environment Variable Loading**

Added `dotenv` dependency:

```bash
npm install dotenv
```

Import in `prisma.config.ts`:

```typescript
import 'dotenv/config';
```

### 5. **Updated Scripts**

All scripts using PrismaClient updated to use adapter pattern.

## 🔧 Package.json Scripts Added

| Script                    | Purpose                                |
| ------------------------- | -------------------------------------- |
| `npm run prisma:validate` | Validates schema syntax + formatting   |
| `npm run prisma:format`   | Auto-formats schema file               |
| `npm run prisma:check`    | Shows SQL diff for schema changes      |
| `npm run db:validate`     | Runs comprehensive database tests      |
| `npm run db:verify`       | **Main script** - validates everything |
| `postinstall`             | Auto-generates Prisma Client           |

## Manual Steps After Prisma Upgrade

### 1. Check Breaking Changes

Visit: https://github.com/prisma/prisma/releases

Key areas to review:

- Client API changes
- Query behavior changes
- Migration changes
- TypeScript type changes

### 2. Regenerate Prisma Client

```bash
npm run prisma:generate
```

### 3. Check Schema Compatibility

```bash
npm run prisma:validate
```

### 4. Format Schema (Optional)

```bash
npm run prisma:format
```

### 5. Verify Database State

```bash
npm run db:validate
```

This validates:

- ✅ Database connectivity
- ✅ All models are accessible
- ✅ Migrations are applied
- ✅ Critical indexes exist
- ✅ Enum types are correct
- ✅ Prisma Client version

### 6. Check for Pending Migrations

```bash
# Generate SQL for any schema drift
npm run prisma:check

# If drift detected, create migration
npm run prisma:migrate:dev
```

### 7. Run Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e
```

### 8. Test in Development

```bash
npm run start:dev
```

Test these critical endpoints:

- `GET /api/v1/health` - Health check
- `GET /api/v1/profiles/me` - Profile access (requires auth)

### 9. Check Prisma Studio

```bash
npm run prisma:studio
```

Verify all tables and relationships are visible.

## Common Prisma 7.x Changes to Watch

### New Features

- **TypedSQL** - Type-safe raw SQL queries
- **Join strategy improvements** - Better query performance
- **Improved error messages** - More helpful debugging

### Potential Breaking Changes

- Client API refinements
- Migration file format changes
- Query engine behavior updates

## When Adding New Tables/Models

1. **Update Schema**

   ```bash
   # Edit prisma/schema.prisma
   ```

2. **Create Migration**

   ```bash
   npm run prisma:migrate:dev
   ```

3. **Add Validation Test**
   - Edit `scripts/validate-db.js`
   - Add model count check in tests array

4. **Run Full Verification**

   ```bash
   npm run db:verify
   ```

5. **Update Documentation**
   - Update this checklist if needed
   - Document model purpose in schema comments

## Troubleshooting

### Client Out of Sync

```bash
rm -rf node_modules/.prisma
npm run prisma:generate
```

### Migration Issues

```bash
# Check current migration status
npx prisma migrate status

# Reset database (DEV ONLY!)
npm run reset:local
```

### Schema Drift Detection

```bash
# See what SQL would bring DB in sync
npm run prisma:check
```

## Environment-Specific Testing

### Local Development

```bash
npm run reset:local
npm run db:verify
```

### Docker Environment

```bash
npm run docker:reset
npm run db:verify
```

### CI/CD Pipeline

```bash
npm run prisma:migrate:deploy
npm run db:validate
npm test
```

## Post-Upgrade Verification Checklist

- [ ] Schema validated (`npm run prisma:validate`)
- [ ] Client generated (`npm run prisma:generate`)
- [ ] Database validated (`npm run db:validate`)
- [ ] All tests pass (`npm test && npm run test:e2e`)
- [ ] Application starts (`npm run start:dev`)
- [ ] Health endpoint responds (`curl http://localhost:3000/api/v1/health`)
- [ ] Prisma Studio opens (`npm run prisma:studio`)
- [ ] No migration drift (`npm run prisma:check`)

## Resources

- [Prisma Releases](https://github.com/prisma/prisma/releases)
- [Prisma Upgrade Guide](https://www.prisma.io/docs/guides/upgrade-guides)
- [Prisma 7.0 Announcement](https://www.prisma.io/blog)
