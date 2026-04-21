#!/usr/bin/env node

/**
 * GDPR Processing - CLI Script
 *
 * Manually invokes all GDPR background processors.
 *
 * Usage:
 *   npm run job:gdpr
 *   npx ts-node scripts/ops/jobs/run-gdpr.ts [batchSize]
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../src/app.module';

// Services
import { GdprCronService } from '../../../src/modules/gdpr/gdpr-cron.service';

async function bootstrap() {
  console.log('[GDPR] Starting GDPR processing...\n');

  // Parse batch size from command line
  const batchSize = parseInt(process.argv[2]) || 10;
  console.log(`[GDPR] Batch size: ${batchSize}\n`);

  // Create NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const results = {
    exports: { processed: 0, durationMs: 0 },
    suspensions: { processed: 0, durationMs: 0 },
    expirations: { escalated: 0, durationMs: 0 },
    deletions: { processed: 0, durationMs: 0 },
  };

  try {
    const gdprCron = app.get(GdprCronService);

    // 1. Process pending exports
    console.log('─────────────────────────────────────────────');
    console.log('1. Processing Export Requests');
    console.log('─────────────────────────────────────────────\n');
    results.exports = await gdprCron.processPendingExports(batchSize);
    console.log(`   Processed: ${results.exports.processed}`);
    console.log(`   Duration:  ${results.exports.durationMs}ms\n`);

    // 2. Process pending suspensions
    console.log('─────────────────────────────────────────────');
    console.log('2. Processing Suspension Requests');
    console.log('─────────────────────────────────────────────\n');
    results.suspensions = await gdprCron.processPendingSuspensions(batchSize);
    console.log(`   Processed: ${results.suspensions.processed}`);
    console.log(`   Duration:  ${results.suspensions.durationMs}ms\n`);

    // 3. Process expired suspensions (escalation)
    console.log('─────────────────────────────────────────────');
    console.log('3. Processing Suspension Expirations');
    console.log('─────────────────────────────────────────────\n');
    results.expirations = await gdprCron.processExpiredSuspensions(batchSize);
    console.log(`   Escalated: ${results.expirations.escalated}`);
    console.log(`   Duration:  ${results.expirations.durationMs}ms\n`);

    // 4. Process pending deletions
    console.log('─────────────────────────────────────────────');
    console.log('4. Processing Deletion Requests');
    console.log('─────────────────────────────────────────────\n');
    results.deletions = await gdprCron.processPendingDeletions(batchSize);
    console.log(`   Processed: ${results.deletions.processed}`);
    console.log(`   Duration:  ${results.deletions.durationMs}ms\n`);

    // Display summary
    console.log('═══════════════════════════════════════════════');
    console.log('GDPR Processing Summary:');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Exports:     ${results.exports.processed} processed`);
    console.log(`  Suspensions: ${results.suspensions.processed} processed`);
    console.log(`  Expirations: ${results.expirations.escalated} escalated`);
    console.log(`  Deletions:   ${results.deletions.processed} processed`);
    console.log('═══════════════════════════════════════════════\n');

    const totalProcessed =
      results.exports.processed +
      results.suspensions.processed +
      results.expirations.escalated +
      results.deletions.processed;

    if (totalProcessed === 0) {
      console.log('✓ No pending GDPR requests to process.\n');
    } else {
      console.log(`✓ Processed ${totalProcessed} total GDPR requests.\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error during processing:');
    console.error(error);
    process.exit(1);
  } finally {
    // Clean up
    await app.close();
  }
}

// Run the script
bootstrap().catch((error) => {
  console.error('\n❌ Bootstrap failed:');
  console.error(error);
  process.exit(1);
});
