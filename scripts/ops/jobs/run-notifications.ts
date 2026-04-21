#!/usr/bin/env node

/**
 * Notification Processing - CLI Script
 *
 * Manually invokes the notification processing service.
 *
 * Usage:
 *   npm run job:notifications
 *   npx ts-node scripts/ops/jobs/run-notifications.ts [batchSize]
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../src/app.module';

// Services
import { NotificationsCronService } from '../../../src/modules/notifications/notifications-cron.service';

async function bootstrap() {
  console.log('[Notifications] Starting manual processing...\n');

  // Parse batch size from command line
  const batchSize = parseInt(process.argv[2]) || 100;
  console.log(`[Notifications] Batch size: ${batchSize}\n`);

  // Create NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const notificationsCron = app.get(NotificationsCronService);

    // Process pending notifications
    console.log('[Notifications] Processing pending notifications...\n');
    const result = await notificationsCron.processPendingNotifications(batchSize);

    // Display results
    console.log('\n─────────────────────────────────────────────');
    console.log('Notification Processing Summary:');
    console.log('─────────────────────────────────────────────');
    console.log(`Processed:   ${result.processed}`);
    console.log(`Succeeded:   ${result.succeeded}`);
    console.log(`Failed:      ${result.failed}`);
    console.log(`Duration:    ${result.durationMs}ms`);
    console.log('─────────────────────────────────────────────\n');

    if (result.processed === 0) {
      console.log('✓ No pending notifications to process.\n');
    } else if (result.failed === 0 && result.processed > 0) {
      console.log('✓ All notifications processed successfully!\n');
    } else if (result.failed > 0) {
      console.log(`⚠ ${result.failed} notification(s) failed. Check logs for details.\n`);
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
