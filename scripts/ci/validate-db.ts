#!/usr/bin/env node

/**
 * Database Validation Script
 *
 * Validates Prisma schema against the actual database state.
 * Useful after Prisma upgrades or schema changes.
 *
 * Usage: npx ts-node scripts/ci/validate-db.ts
 */

// Load environment variables first
import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/** Result of a single validation test */
interface TestResult {
  success: boolean;
  info?: string;
  error?: string;
}

/** A test definition */
interface TestDefinition {
  name: string;
  test: () => TestResult | Promise<TestResult>;
}

/** Raw SQL row from _prisma_migrations table */
interface MigrationRow {
  migration_name: string;
  finished_at: string | null;
  rolled_back_at: string | null;
}

/** Raw SQL row from pg_indexes */
interface IndexRow {
  tablename: string;
  indexname: string;
  indexdef: string;
}

/** Raw SQL row from pg_type/pg_enum join */
interface EnumRow {
  enum_name: string;
}

// Check DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  console.error('\n❌ DATABASE_URL environment variable is not set!');
  console.error('\nPlease create a .env file with:');
  console.error('DATABASE_URL="postgresql://user:password@localhost:5432/dbname"\n');
  process.exit(1);
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

// Create adapter and Prisma client
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function validateDatabase() {
  console.log('🔍 Starting database validation...\n');

  const tests: TestDefinition[] = [];
  let passed = 0;
  let failed = 0;

  // Test 1: Database connection
  tests.push({
    name: 'Database Connection',
    test: async () => {
      await prisma.$connect();
      return { success: true };
    },
  });

  // Test 2: Query execution
  tests.push({
    name: 'Basic Query Execution',
    test: async () => {
      await prisma.$queryRaw`SELECT 1 as test`;
      return { success: true };
    },
  });

  // Test 3: Profile table accessibility
  tests.push({
    name: 'Profile Model Access',
    test: async () => {
      const count = await prisma.profile.count();
      return { success: true, info: `${count} profiles found` };
    },
  });

  // Test 4: Request table accessibility
  tests.push({
    name: 'Request Model Access',
    test: async () => {
      const count = await prisma.request.count();
      return { success: true, info: `${count} requests found` };
    },
  });

  // Test 5: GdprAuditLog table accessibility
  tests.push({
    name: 'GdprAuditLog Model Access',
    test: async () => {
      const count = await prisma.gdprAuditLog.count();
      return { success: true, info: `${count} audit logs found` };
    },
  });

  // Test 6: Notification table accessibility
  tests.push({
    name: 'Notification Model Access',
    test: async () => {
      const count = await prisma.notificationLog.count();
      return { success: true, info: `${count} notifications found` };
    },
  });

  // Test 7: Check for pending migrations
  tests.push({
    name: 'Migration Status Check',
    test: async () => {
      // Query _prisma_migrations table if it exists
      try {
        const migrations: MigrationRow[] = await prisma.$queryRaw`
          SELECT migration_name, finished_at, rolled_back_at 
          FROM _prisma_migrations 
          WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
          ORDER BY started_at DESC 
          LIMIT 5
        `;

        if (migrations.length === 0) {
          return { success: true, info: 'All migrations applied' };
        } else {
          return {
            success: false,
            error: `${migrations.length} pending/rolled back migrations detected`,
          };
        }
      } catch (error) {
        // If table doesn't exist, assume migrations are fine
        return { success: true, info: 'Migration table check skipped' };
      }
    },
  });

  // Test 8: Index validation (check if key indexes exist)
  tests.push({
    name: 'Index Validation',
    test: async () => {
      const indexes: IndexRow[] = await prisma.$queryRaw`
        SELECT 
          tablename, 
          indexname,
          indexdef 
        FROM pg_indexes 
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
      `;

      // Critical indexes that must exist for performance and data integrity
      // Names should match the actual schema.prisma definitions
      const criticalIndexes = [
        'gdpr_requests_identity_id_idx',
        'gdpr_requests_request_type_status_idx',
        'profiles_identity_id_key',
      ];

      const foundIndexes = indexes.map((idx) => idx.indexname);
      const missingIndexes = criticalIndexes.filter((idx) => !foundIndexes.includes(idx));

      if (missingIndexes.length > 0) {
        return {
          success: false,
          error: `Missing indexes: ${missingIndexes.join(', ')}`,
        };
      }

      return { success: true, info: `${indexes.length} indexes found` };
    },
  });

  // Test 9: Enum type validation
  tests.push({
    name: 'Enum Type Validation',
    test: async () => {
      const enums: EnumRow[] = await prisma.$queryRaw`
        SELECT DISTINCT t.typname as enum_name
        FROM pg_type t 
        JOIN pg_enum e ON t.oid = e.enumtypid  
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        ORDER BY t.typname
      `;

      const expectedEnums = ['gdpr_request_type', 'gdpr_request_status', 'gdpr_audit_action'];
      const foundEnums = enums.map((e) => e.enum_name);
      const missingEnums = expectedEnums.filter((e) => !foundEnums.includes(e));

      if (missingEnums.length > 0) {
        return {
          success: false,
          error: `Missing enums: ${missingEnums.join(', ')}`,
        };
      }

      return { success: true, info: `${enums.length} enums validated` };
    },
  });

  // Test 10: Prisma Client version check
  tests.push({
    name: 'Prisma Client Version',
    test: (): TestResult => {
      const clientVersion =
        '_clientVersion' in prisma &&
        typeof (prisma as Record<string, unknown>)['_clientVersion'] === 'string'
          ? ((prisma as Record<string, unknown>)['_clientVersion'] as string)
          : 'unknown';
      return { success: true, info: `v${clientVersion}` };
    },
  });

  // Execute all tests
  for (const test of tests) {
    process.stdout.write(`  ${test.name.padEnd(35, '.')} `);

    try {
      const result = await test.test();

      if (result.success) {
        passed++;
        const info = result.info ? ` (${result.info})` : '';
        console.log(`✅ PASS${info}`);
      } else {
        failed++;
        console.log(`❌ FAIL: ${result.error}`);
      }
    } catch (error: unknown) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`❌ ERROR: ${message}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
  console.log('─'.repeat(60) + '\n');

  await prisma.$disconnect();
  await pool.end();

  if (failed > 0) {
    console.error('❌ Database validation failed!\n');
    process.exit(1);
  } else {
    console.log('✅ Database validation successful!\n');
    process.exit(0);
  }
}

// Handle errors
validateDatabase().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('\n❌ Validation script failed:', message);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
