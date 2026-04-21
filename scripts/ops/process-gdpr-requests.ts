#!/usr/bin/env node

/**
 * GDPR Request Processor - Manual Trigger Script
 *
 * This script manually invokes the GDPR request processor service.
 * It's intended for development, testing, and manual operations.
 *
 * Usage:
 *   npx ts-node scripts/ops/process-gdpr-requests.ts [batchSize]
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';

// Services
import { GdprRequestProcessorService } from '../../src/modules/gdpr/gdpr-request-processor.service';

async function bootstrap() {
  console.log('[GDPR Processor] Starting manual processing...\n');

  // Parse batch size from command line
  const batchSize = parseInt(process.argv[2]) || 10;
  console.log(`[GDPR Processor] Batch size: ${batchSize}\n`);

  // Create NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const processor = app.get(GdprRequestProcessorService);

    // Process pending requests
    console.log('[GDPR Processor] Processing pending export requests...\n');
    const summary = await processor.processPendingExports(batchSize);

    // Display results
    console.log('\n─────────────────────────────────────────────');
    console.log('Processing Summary:');
    console.log('─────────────────────────────────────────────');
    console.log(`Total Found:      ${summary.totalFound}`);
    console.log(`Processed:        ${summary.processed}`);
    console.log(`Failed:           ${summary.failed}`);
    console.log(`Skipped:          ${summary.skipped}`);
    console.log('─────────────────────────────────────────────\n');

    if (summary.totalFound === 0) {
      console.log('✓ No pending requests to process.\n');
    } else if (summary.failed === 0 && summary.processed > 0) {
      console.log('✓ All requests processed successfully!\n');
    } else if (summary.failed > 0) {
      console.log(`⚠ ${summary.failed} request(s) failed. Check logs for details.\n`);
    }
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
