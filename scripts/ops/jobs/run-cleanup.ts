#!/usr/bin/env node

/**
 * Cleanup Jobs - CLI Script
 *
 * Manually invokes all infrastructure cleanup jobs.
 *
 * Usage:
 *   npm run job:cleanup
 *   npx ts-node scripts/ops/jobs/run-cleanup.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../src/app.module';

// Services
import { CleanupCronService } from '../../../src/infrastructure/cleanup/cleanup-cron.service';

async function bootstrap() {
  console.log('[Cleanup] Starting infrastructure cleanup...\n');

  // Create NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const cleanupCron = app.get(CleanupCronService);

    // Run all cleanup jobs
    console.log('[Cleanup] Running all cleanup jobs...\n');
    const result = await cleanupCron.runAllCleanups();

    // Display results
    console.log('\n─────────────────────────────────────────────');
    console.log('Cleanup Summary:');
    console.log('─────────────────────────────────────────────');
    console.log(`Total Deleted:   ${result.totalRecordsDeleted}`);
    console.log(`Duration:        ${result.durationMs}ms`);
    console.log('');
    console.log('Job Details:');

    // result.results is likely a Map
    result.results.forEach((jobResult, jobName) => {
      const status = jobResult.error ? '❌' : '✅';
      console.log(`  ${status} ${jobName}: ${jobResult.recordsDeleted} record(s) deleted`);
      if (jobResult.error) {
        console.log(`     Error: ${jobResult.error}`);
      }
    });

    console.log('─────────────────────────────────────────────\n');

    if (result.totalRecordsDeleted === 0) {
      console.log('✓ No records to clean up.\n');
    } else {
      console.log(`✓ Cleanup completed: ${result.totalRecordsDeleted} record(s) deleted.\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error during cleanup:');
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
