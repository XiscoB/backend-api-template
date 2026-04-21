#!/usr/bin/env node

/**
 * Reports Digest - Manual Runner
 *
 * Manually invokes the Reports Digest Job.
 *
 * Usage:
 *   npx ts-node scripts/ops/jobs/run-reports-digest.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../src/app.module';

// Services
import { ReportsDigestJob } from '../../../src/modules/reports/jobs/reports-digest.job';

async function bootstrap() {
  // Create NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const job = app.get(ReportsDigestJob);

    await job.run();

    // Explicitly safe exit
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error during reports digest execution:');
    console.error(error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

// Run the script
bootstrap().catch((error) => {
  console.error('\n❌ Bootstrap failed:');
  console.error(error);
  process.exit(1);
});
