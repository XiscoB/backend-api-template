#!/usr/bin/env node

/**
 * Delivery Retry Processing - CLI Script
 *
 * Manually invokes the delivery retry queue processor.
 *
 * Usage:
 *   npm run job:retries
 *   npx ts-node scripts/ops/jobs/run-retries.ts [batchSize]
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../src/app.module';

// Services
import { DeliveryRetryService } from '../../../src/modules/notifications/delivery-retry.service';

async function bootstrap() {
  console.log('[Retries] Starting retry queue processing...\n');

  // Parse batch size from command line
  const batchSize = parseInt(process.argv[2]) || 50;
  console.log(`[Retries] Batch size: ${batchSize}\n`);

  // Create NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const retryService = app.get(DeliveryRetryService);

    // Process retry queue
    console.log('[Retries] Processing retry queue...\n');
    const result = await retryService.processRetryQueue(batchSize);

    // Display results
    console.log('\n─────────────────────────────────────────────');
    console.log('Retry Processing Summary:');
    console.log('─────────────────────────────────────────────');
    console.log(`Enabled:     ${result.enabled ? 'Yes' : 'No'}`);

    if (result.enabled) {
      console.log(`Processed:   ${result.processed}`);
      console.log(`Succeeded:   ${result.succeeded}`);
      console.log(`Failed:      ${result.failed}`);
      console.log(`Exhausted:   ${result.exhausted}`);
      console.log(`Duration:    ${result.durationMs}ms`);
    }

    console.log('─────────────────────────────────────────────\n');

    if (!result.enabled) {
      console.log('⚠ Retry processing is disabled (NOTIFICATION_RETRY_ENABLED=false)\n');
    } else if (result.processed === 0) {
      console.log('✓ No retries to process.\n');
    } else if (result.failed === 0 && result.processed > 0) {
      console.log('✓ All retries processed successfully!\n');
    } else if (result.failed > 0) {
      console.log(`⚠ ${result.failed} retry(ies) failed. Check logs for details.\n`);
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
