#!/usr/bin/env node
/**
 * Test script for GDPR Dynamic Collector
 *
 * Tests the new registry-driven dynamic data collection.
 *
 * Usage:
 *   npm run build && node scripts/test-dynamic-collector.js
 *   npm run build && node scripts/test-dynamic-collector.js <identityId>
 *
 * @see .github/agents/testing.md for test patterns
 */

require('dotenv').config();

async function main() {
  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../../dist/app.module');

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  GDPR Dynamic Collector Test');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Create app instance
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const { PrismaService } = require('../../dist/common/prisma/prisma.service');
  const {
    GdprDynamicCollectorService,
  } = require('../../dist/modules/gdpr/gdpr-dynamic-collector.service');

  const prisma = app.get(PrismaService);
  const dynamicCollector = app.get(GdprDynamicCollectorService);

  // Get identity from args or use first one
  let identityId = process.argv[2];

  if (!identityId) {
    const identity = await prisma.identity.findFirst();
    if (!identity) {
      console.log('❌ No identities found in database!');
      await app.close();
      process.exit(1);
    }
    identityId = identity.id;
    console.log(`Using first identity: ${identityId}\n`);
  } else {
    console.log(`Using specified identity: ${identityId}\n`);
  }

  // Run dynamic collection
  console.log('─────────────────────────────────────────────────────────────────────');
  console.log('1. Dynamic Collection');
  console.log('─────────────────────────────────────────────────────────────────────\n');

  try {
    const result = await dynamicCollector.collectAllData(identityId, 'en');

    console.log(`Collected at: ${result.collectedAt.toISOString()}`);
    console.log(`Tables collected: ${result.tables.length}`);
    console.log(`Sections: ${result.sections.length}\n`);

    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('2. Tables Summary');
    console.log('─────────────────────────────────────────────────────────────────────\n');

    for (const table of result.tables) {
      console.log(`📦 ${table.tableDef.modelName} (${table.tableDef.section ?? 'other'})`);
      console.log(`   Records: ${table.recordCount}`);
      if (table.records.length > 0) {
        console.log(`   Fields: ${table.records[0].formatted.map((f) => f.field).join(', ')}`);
      }
      console.log('');
    }

    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('3. Sections Detail');
    console.log('─────────────────────────────────────────────────────────────────────\n');

    for (const section of result.sections) {
      console.log(`📋 Section: ${section.section.toUpperCase()}`);
      console.log('   ─────────────────────────────────────────────────────');

      for (const table of section.tables) {
        console.log(`   ${table.tableDef.modelName}:`);
        for (const record of table.records) {
          for (const field of record.formatted) {
            console.log(`      ${field.label}: ${field.value}`);
          }
          console.log('');
        }
      }
    }

    console.log('─────────────────────────────────────────────────────────────────────');
    console.log('4. Summary');
    console.log('─────────────────────────────────────────────────────────────────────\n');

    const totalRecords = result.tables.reduce((sum, t) => sum + t.recordCount, 0);
    console.log(`✅ Dynamic collection successful!`);
    console.log(`   Identity: ${identityId}`);
    console.log(`   Tables: ${result.tables.length}`);
    console.log(`   Sections: ${result.sections.length}`);
    console.log(`   Total records: ${totalRecords}`);
  } catch (error) {
    console.error('❌ Dynamic collection failed:', error.message);
  }

  await app.close();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
