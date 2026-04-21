#!/usr/bin/env node

/**
 * Run All Background Jobs - CLI Script
 *
 * Manually invokes all background jobs (notifications, retries, cleanup, GDPR).
 *
 * Usage:
 *   npm run job:all
 *   npx ts-node scripts/ops/jobs/run-all.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../src/app.module';

// Services
import { NotificationsCronService } from '../../../src/modules/notifications/notifications-cron.service';
import { DeliveryRetryService } from '../../../src/modules/notifications/delivery-retry.service';
import { GdprCronService } from '../../../src/modules/gdpr/gdpr-cron.service';
import { CleanupCronService } from '../../../src/infrastructure/cleanup/cleanup-cron.service';

interface NotificationResult {
  processed: number;
  succeeded: number;
  failed: number;
  durationMs: number;
}

interface RetryResult {
  enabled: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  exhausted: number;
  durationMs: number;
}

interface GdprAggregate {
  exports: number;
  suspensions: number;
  expirations: number;
  deletions: number;
  totalProcessed: number;
}

interface CleanupJobResult {
  error?: string;
  recordsDeleted: number;
}

interface CleanupResult {
  totalRecordsDeleted: number;
  durationMs: number;
  results: Map<string, CleanupJobResult>;
}

interface JobResults {
  notifications: NotificationResult | null;
  retries: RetryResult | null;
  gdpr: GdprAggregate | null;
  cleanup: CleanupResult | null;
}

async function bootstrap() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Running All Background Jobs');
  console.log('═══════════════════════════════════════════════\n');

  // Create NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const results: JobResults = {
    notifications: null,
    retries: null,
    gdpr: null,
    cleanup: null,
  };

  try {
    // 1. Process pending notifications
    console.log('─────────────────────────────────────────────');
    console.log('1. Processing Notifications');
    console.log('─────────────────────────────────────────────\n');

    const notificationsCron = app.get(NotificationsCronService);
    results.notifications =
      (await notificationsCron.processPendingNotifications()) as NotificationResult;

    console.log(`   Processed: ${results.notifications.processed}`);
    console.log(`   Succeeded: ${results.notifications.succeeded}`);
    console.log(`   Failed:    ${results.notifications.failed}`);
    console.log(`   Duration:  ${results.notifications.durationMs}ms\n`);

    // 2. Process delivery retry queue
    console.log('─────────────────────────────────────────────');
    console.log('2. Processing Retry Queue');
    console.log('─────────────────────────────────────────────\n');

    const retryService = app.get(DeliveryRetryService);
    results.retries = (await retryService.processRetryQueue()) as RetryResult;

    console.log(`   Enabled:   ${results.retries.enabled ? 'Yes' : 'No'}`);
    if (results.retries.enabled) {
      console.log(`   Processed: ${results.retries.processed}`);
      console.log(`   Succeeded: ${results.retries.succeeded}`);
      console.log(`   Failed:    ${results.retries.failed}`);
      console.log(`   Exhausted: ${results.retries.exhausted}`);
    }
    console.log(`   Duration:  ${results.retries.durationMs}ms\n`);

    // 3. Process GDPR requests (exports, suspensions, expirations, deletions)
    console.log('─────────────────────────────────────────────');
    console.log('3. Processing GDPR Requests');
    console.log('─────────────────────────────────────────────\n');

    const gdprCron = app.get(GdprCronService);

    // Process all GDPR request types
    const gdprExports = await gdprCron.processPendingExports();
    const gdprSuspensions = await gdprCron.processPendingSuspensions();
    const gdprExpirations = await gdprCron.processExpiredSuspensions();
    const gdprDeletions = await gdprCron.processPendingDeletions();

    results.gdpr = {
      exports: gdprExports.processed,
      suspensions: gdprSuspensions.processed,
      expirations: gdprExpirations.escalated,
      deletions: gdprDeletions.processed,
      totalProcessed:
        gdprExports.processed +
        gdprSuspensions.processed +
        gdprExpirations.escalated +
        gdprDeletions.processed,
    };

    console.log(`   Exports:     ${results.gdpr.exports} processed`);
    console.log(`   Suspensions: ${results.gdpr.suspensions} processed`);
    console.log(`   Expirations: ${results.gdpr.expirations} escalated`);
    console.log(`   Deletions:   ${results.gdpr.deletions} processed\n`);

    // 4. Run cleanup jobs
    console.log('─────────────────────────────────────────────');
    console.log('4. Running Cleanup Jobs');
    console.log('─────────────────────────────────────────────\n');

    const cleanupCron = app.get(CleanupCronService);
    results.cleanup = (await cleanupCron.runAllCleanups()) as CleanupResult;

    console.log(`   Total Deleted: ${results.cleanup.totalRecordsDeleted}`);
    results.cleanup.results.forEach((jobResult: CleanupJobResult, jobName: string) => {
      const status = jobResult.error ? '❌' : '✅';
      console.log(`   ${status} ${jobName}: ${jobResult.recordsDeleted}`);
    });
    console.log(`   Duration:  ${results.cleanup.durationMs}ms\n`);

    // Final summary
    console.log('═══════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Notifications: ${results.notifications.processed} processed`);
    console.log(
      `  Retries:       ${results.retries.enabled ? results.retries.processed : 'disabled'}`,
    );
    console.log(`  GDPR:          ${results.gdpr.totalProcessed} processed`);
    console.log(`    - Exports:     ${results.gdpr.exports}`);
    console.log(`    - Suspensions: ${results.gdpr.suspensions}`);
    console.log(`    - Expirations: ${results.gdpr.expirations}`);
    console.log(`    - Deletions:   ${results.gdpr.deletions}`);
    console.log(`  Cleanup:       ${results.cleanup.totalRecordsDeleted} deleted`);
    console.log('═══════════════════════════════════════════════\n');

    console.log('✓ All background jobs completed.\n');
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
