#!/usr/bin/env node
/**
 * GDPR Export Coverage Validation Script
 *
 * Validates that all user data registered in GDPR registry is properly
 * exported in the GDPR export.
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import type { GdprCollectedData } from '../../src/modules/gdpr/gdpr-collection.types';
import type { GdprExportTableDef } from '../../src/modules/gdpr/gdpr.registry';

/** Result for a single table's data query */
interface TableQueryResult {
  count?: number;
  records?: unknown[];
  export?: boolean;
  error?: string;
}

/** A coverage gap found during analysis */
interface CoverageGap {
  table: string;
  issue: string;
  records: number;
  recommendation: string;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  GDPR Export Coverage Validation');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const { PrismaService } = await import('../../src/common/prisma/prisma.service');
  const prisma = app.get(PrismaService);

  // Get identity to test with
  let identityId = process.argv[2];
  if (!identityId) {
    const identity = await prisma.identity.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (!identity) {
      console.error('❌ No identities found in database. Create some test data first.');
      await app.close();
      process.exit(1);
    }
    identityId = identity.id;
    console.log(`Using most recent identity: ${identityId}\n`);
  } else {
    console.log(`Using specified identity: ${identityId}\n`);
  }

  // Load GDPR registry
  const { GDPR_EXPORT_TABLES, GDPR_EXCLUDED_TABLES } =
    await import('../../src/modules/gdpr/gdpr.registry');

  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('1. GDPR Registry Status');
  console.log('─────────────────────────────────────────────────────────────────────\n');

  console.log(`Registered for export: ${GDPR_EXPORT_TABLES.length} tables`);
  GDPR_EXPORT_TABLES.forEach((t) => {
    const exportFlag = t.export ? '✅' : '⏭️ ';
    console.log(`  ${exportFlag} ${t.tableName} (${t.modelName}) via ${t.userField}`);
  });

  console.log(`\nExcluded from GDPR: ${GDPR_EXCLUDED_TABLES.length} tables`);
  GDPR_EXCLUDED_TABLES.forEach((t) => {
    console.log(`  ⊘  ${t}`);
  });

  console.log('\n─────────────────────────────────────────────────────────────────────');
  console.log('2. Actual Data in Database for Identity');
  console.log('─────────────────────────────────────────────────────────────────────\n');

  const results: Record<string, TableQueryResult> = {};

  /** Safely access a Prisma model by name. Returns findMany if the model exists. */
  function getPrismaModel(
    key: string,
  ): { findMany: (args: Record<string, unknown>) => Promise<unknown[]> } | undefined {
    // Runtime property check: Prisma client exposes models as camelCase properties.
    // Use bracket notation via typed parameter to avoid as-unknown-as laundering.
    if (!(key in prisma)) return undefined;
    const value: unknown = Reflect.get(prisma, key);
    if (typeof value !== 'object' || value === null) return undefined;
    const candidate = value as Record<string, unknown>;
    if (typeof candidate['findMany'] !== 'function') return undefined;
    return candidate as {
      findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    };
  }

  // Query each registered table
  for (const table of GDPR_EXPORT_TABLES) {
    try {
      const modelKey = table.modelName.charAt(0).toLowerCase() + table.modelName.slice(1);
      const model = getPrismaModel(modelKey);

      if (!model) {
        console.log(`  ⚠️  ${table.tableName}: Model not found in Prisma client`);
        results[table.tableName] = { error: 'Model not found' };
        continue;
      }

      // Build the query based on userField
      let records: unknown[] = [];
      if (table.userField === 'identityId') {
        records = await model.findMany({
          where: { identityId },
        });
      } else if (table.userField === 'notificationProfileId') {
        // Need to join through UserNotificationProfile
        const profile = await prisma.userNotificationProfile.findUnique({
          where: { identityId },
        });
        if (profile) {
          records = await model.findMany({
            where: { notificationProfileId: profile.id },
          });
        }
      } else {
        console.log(`  ⚠️  ${table.tableName}: Unsupported userField: ${table.userField}`);
        results[table.tableName] = { error: `Unsupported userField: ${table.userField}` };
        continue;
      }

      const exportFlag = table.export ? '📦' : '⏭️ ';
      console.log(`  ${exportFlag} ${table.tableName}: ${records.length} record(s)`);

      results[table.tableName] = {
        count: records.length,
        records: records,
        export: table.export,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ ${table.tableName}: Error - ${message}`);
      results[table.tableName] = { error: message };
    }
  }

  console.log('\n─────────────────────────────────────────────────────────────────────');
  console.log('3. Data Collector Output');
  console.log('─────────────────────────────────────────────────────────────────────\n');

  // Run the actual data collector
  const { GdprDataOrchestratorService } =
    await import('../../src/modules/gdpr/gdpr-data-orchestrator.service');
  const orchestrator = app.get(GdprDataOrchestratorService);

  let collectedData: GdprCollectedData | null;
  try {
    const result = await orchestrator.collectUserData(identityId);
    collectedData = result.data;

    console.log('Collected sections:');
    console.log(`  📋 identity: ${collectedData.identity ? 'Yes' : 'No'}`);
    console.log(`  📋 profile: ${collectedData.profile ? 'Yes' : 'No'}`);
    console.log(`  📋 notifications: ${collectedData.notifications?.totalCount ?? 0} records`);
    console.log(
      `  📋 notificationPreferences: ${collectedData.notificationPreferences ? 'Yes' : 'No'}`,
    );

    if (collectedData.notificationPreferences) {
      console.log(
        `     → channels: [${collectedData.notificationPreferences.channels.join(', ')}]`,
      );
      if ((collectedData.notificationPreferences.emailChannels?.length ?? 0) > 0) {
        console.log(
          `     → emailChannels: ${collectedData.notificationPreferences.emailChannels.length} record(s)`,
        );
      }
      if ((collectedData.notificationPreferences.pushChannels?.length ?? 0) > 0) {
        console.log(
          `     → pushChannels: ${collectedData.notificationPreferences.pushChannels.length} record(s)`,
        );
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`❌ Data collection failed: ${message}`);
    collectedData = null;
  }

  console.log('\n─────────────────────────────────────────────────────────────────────');
  console.log('4. Coverage Gap Analysis');
  console.log('─────────────────────────────────────────────────────────────────────\n');

  const gaps: CoverageGap[] = [];

  // Check user_email_channel
  if ((results['user_email_channel']?.count ?? 0) > 0) {
    const hasEmailDetails = collectedData?.notificationPreferences?.emailChannels;
    if (!hasEmailDetails) {
      gaps.push({
        table: 'user_email_channel',
        issue: 'Email addresses not included in export',
        records: results['user_email_channel']?.count ?? 0,
        recommendation: 'Add emailChannels to GdprNotificationPreferencesData type and collector',
      });
    }
  }

  // Check user_push_channel
  if ((results['user_push_channel']?.count ?? 0) > 0) {
    const hasPushDetails = collectedData?.notificationPreferences?.pushChannels;
    if (!hasPushDetails) {
      gaps.push({
        table: 'user_push_channel',
        issue: 'Push tokens/device info not included in export',
        records: results['user_push_channel']?.count ?? 0,
        recommendation: 'Add pushChannels to GdprNotificationPreferencesData type and collector',
      });
    }
  }

  // Check for tables with export: true that have records but might not be collected
  for (const table of GDPR_EXPORT_TABLES) {
    if (!table.export) continue;
    const result = results[table.tableName];
    if ((result?.count ?? 0) > 0) {
      // Check if this data appears in the collected data
      // (This is a simplified check - real validation would be more thorough)
      const tableInCollected = checkTableInCollectedData(table, collectedData);
      if (!tableInCollected) {
        gaps.push({
          table: table.tableName,
          issue: `Data exists but may not be fully exported`,
          records: result?.count ?? 0,
          recommendation: `Verify ${table.modelName} data appears in export document`,
        });
      }
    }
  }

  if (gaps.length === 0) {
    console.log('✅ No coverage gaps detected!\n');
  } else {
    console.log(`⚠️  Found ${gaps.length} potential coverage gap(s):\n`);
    gaps.forEach((gap, idx) => {
      console.log(`${idx + 1}. ${gap.table}`);
      console.log(`   Issue: ${gap.issue}`);
      console.log(`   Records in DB: ${gap.records}`);
      console.log(`   Recommendation: ${gap.recommendation}`);
      console.log('');
    });
  }

  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('5. Summary');
  console.log('─────────────────────────────────────────────────────────────────────\n');

  const tablesWithData = Object.entries(results).filter(([_, v]) => (v.count ?? 0) > 0);
  console.log(`Tables with user data: ${tablesWithData.length}`);
  console.log(`Coverage gaps found: ${gaps.length}`);
  console.log(`Status: ${gaps.length === 0 ? '✅ PASS' : '⚠️  NEEDS ATTENTION'}`);

  await app.close();
}

/**
 * Check if table data appears in collected data
 */
function checkTableInCollectedData(
  table: GdprExportTableDef,
  collectedData: GdprCollectedData | null,
): boolean {
  if (!collectedData) return false;

  switch (table.modelName) {
    case 'Profile':
      return collectedData.profile !== null;
    case 'NotificationLog':
      return collectedData.notifications?.totalCount >= 0;
    case 'UserNotificationProfile':
      return collectedData.notificationPreferences !== null;
    case 'UserEmailChannel':
      // Check if email channel details are collected
      return (collectedData.notificationPreferences?.emailChannels?.length ?? 0) > 0;
    case 'UserPushChannel':
      // Check if push channel details are collected
      return (collectedData.notificationPreferences?.pushChannels?.length ?? 0) > 0;
    case 'ScheduledNotification':
      return true; // export: false, so not expected
    default:
      return true; // Unknown tables assumed OK
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
