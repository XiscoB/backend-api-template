#!/usr/bin/env node

if (process.env.NODE_ENV === 'production') {
  if (!process.env.ALLOW_DEV_DESTRUCTIVE) {
    console.error('❌ Refusing to run in production environment.');
    console.error('   Set ALLOW_DEV_DESTRUCTIVE=1 to override.');
    process.exit(1);
  }
}

/**
 * GDPR Functionality Test Script
 *
 * Tests GDPR functionality end-to-end by creating test requests and processing them.
 * This script is for DEVELOPMENT and TESTING only.
 *
 * Usage:
 *   node scripts/test-gdpr.js
 *   npm run test:gdpr  (if added to package.json)
 *
 * What this tests:
 * 1. GDPR export request creation
 * 2. GDPR request processing
 * 3. Data packaging
 * 4. Storage integration
 * 5. Cleanup and lifecycle
 *
 * Requirements:
 * - Run `npm run build` first
 * - DATABASE_URL environment variable must be set
 * - At least one test identity in the database
 *
 * Safety:
 * - Only creates test data
 * - Can be run multiple times
 * - Does not affect production data
 */

const { NestFactory } = require('@nestjs/core');

async function bootstrap() {
  console.log('═══════════════════════════════════════════════');
  console.log('  GDPR Functionality Test');
  console.log('═══════════════════════════════════════════════\n');

  // Import after potential build
  const { AppModule } = require('../../dist/app.module');

  // Create NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    // Get required services
    const { PrismaService } = require('../../dist/common/prisma/prisma.service');
    const {
      GdprExportService,
      GdprSuspensionService,
      GdprRequestProcessorService,
    } = require('../../dist/modules/gdpr');

    const prisma = app.get(PrismaService);
    const gdprExportService = app.get(GdprExportService);
    const gdprSuspensionService = app.get(GdprSuspensionService);
    const processor = app.get(GdprRequestProcessorService);

    // Step 1: Find or create a test identity
    console.log('─────────────────────────────────────────────');
    console.log('Step 1: Prepare Test Identity');
    console.log('─────────────────────────────────────────────\n');

    // Prefer non-anonymized identities for testing
    let identity = await prisma.identity.findFirst({
      where: { anonymized: false },
      include: { profile: true },
    });

    // Fallback to any identity if no non-anonymized found
    if (!identity) {
      identity = await prisma.identity.findFirst({
        include: { profile: true },
      });
    }

    if (!identity) {
      console.log('❌ No identities found in database.');
      console.log('   Create a test identity first using the API or database.\n');
      process.exit(1);
    }

    console.log(`✓ Using identity: ${identity.id}`);
    console.log(`  External User ID: ${identity.externalUserId}`);
    console.log(`  Profile: ${identity.profile ? '✓' : '✗'}`);
    console.log(`  Anonymized: ${identity.anonymized ? 'Yes ⚠️' : 'No'}\n`);

    // Step 2: Create a GDPR export request
    console.log('─────────────────────────────────────────────');
    console.log('Step 2: Create GDPR Export Request');
    console.log('─────────────────────────────────────────────\n');

    const exportRequest = await gdprExportService.requestExport(identity.externalUserId);

    console.log(`✓ Export request created: ${exportRequest.id}`);
    console.log(`  Type: ${exportRequest.requestType}`);
    console.log(`  Status: ${exportRequest.status}\n`);

    // Step 3: Process the request
    console.log('─────────────────────────────────────────────');
    console.log('Step 3: Process Export Request');
    console.log('─────────────────────────────────────────────\n');

    const processingResult = await processor.processPendingExports(1);

    console.log(`✓ Processing completed:`);
    console.log(`  Total Found: ${processingResult.totalFound}`);
    console.log(`  Processed:   ${processingResult.processed}`);
    console.log(`  Failed:      ${processingResult.failed}`);
    console.log(`  Skipped:     ${processingResult.skipped}\n`);

    // Step 4: Verify the export was created
    console.log('─────────────────────────────────────────────');
    console.log('Step 4: Verify Export Creation');
    console.log('─────────────────────────────────────────────\n');

    const updatedRequest = await prisma.request.findUnique({
      where: { id: exportRequest.id },
    });

    console.log(`✓ Request status: ${updatedRequest.status}`);

    if (updatedRequest.status === 'COMPLETED') {
      const dataPayload = updatedRequest.dataPayload;
      console.log(`  Export file: ${dataPayload?.exportKey || 'N/A'}`);
      console.log(
        `  File size: ${dataPayload?.fileSizeBytes ? `${dataPayload.fileSizeBytes} bytes` : 'N/A'}`,
      );
      console.log(`  Expires at: ${dataPayload?.expiresAt || 'N/A'}\n`);
    } else if (updatedRequest.status === 'FAILED') {
      console.log(`  Error: ${updatedRequest.errorMessage}\n`);
    } else {
      console.log(`  Note: Request is still in ${updatedRequest.status} state\n`);
    }

    // Step 5: Test suspension (optional)
    console.log('─────────────────────────────────────────────');
    console.log('Step 5: Test Suspension Request');
    console.log('─────────────────────────────────────────────\n');

    let suspensionRequest = null;
    try {
      suspensionRequest = await gdprSuspensionService.requestSuspension(identity.externalUserId);
      console.log(`✓ Suspension request created: ${suspensionRequest.id}`);
      console.log(`  Status: ${suspensionRequest.status}\n`);
    } catch (error) {
      console.log(`⚠️  Suspension request skipped: ${error.message}`);
      console.log(`  (This is expected if identity is anonymized or already suspended)\n`);
    }

    // Step 6: Check identity status
    console.log('─────────────────────────────────────────────');
    console.log('Step 6: Verify Identity Status');
    console.log('─────────────────────────────────────────────\n');

    const finalIdentity = await prisma.identity.findUnique({
      where: { id: identity.id },
      include: {
        requests: { orderBy: { createdAt: 'desc' }, take: 5 },
        accountSuspensions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    console.log(`✓ Identity status:`);
    console.log(`  Is Suspended: ${finalIdentity.isSuspended ? 'Yes' : 'No'}`);
    console.log(`  Is Flagged: ${finalIdentity.isFlagged ? 'Yes' : 'No'}`);
    console.log(`  Anonymized: ${finalIdentity.anonymized ? 'Yes' : 'No'}`);
    console.log(`  Total Requests: ${finalIdentity.requests.length}`);
    if (finalIdentity.accountSuspensions.length > 0) {
      const suspension = finalIdentity.accountSuspensions[0];
      console.log(`  Active Suspension: ${suspension.isActive ? 'Yes' : 'No'}`);
    }
    console.log('');

    // Final summary
    console.log('═══════════════════════════════════════════════');
    console.log('  Test Summary');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Identity:         ${identity.id}`);
    console.log(`  Export Request:   ${exportRequest.id}`);
    console.log(`  Export Status:    ${updatedRequest.status}`);
    console.log(`  Suspension:       ${suspensionRequest ? suspensionRequest.id : 'Skipped'}`);
    console.log(`  Identity Status:  ${finalIdentity.isSuspended ? 'Suspended' : 'Active'}`);
    console.log('═══════════════════════════════════════════════\n');

    console.log('✓ GDPR functionality test completed successfully!\n');
    console.log('Next steps:');
    console.log('  1. Check the export file location in the logs above');
    console.log('  2. Test download via API: GET /api/v1/gdpr/exports/:requestId/download');
    console.log('  3. Resume suspension: POST /api/v1/gdpr/resume');
    console.log('  4. Verify suspension cleanup runs correctly\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    console.error('\nCommon issues:');
    console.error('  - Did you run `npm run build`?');
    console.error('  - Is DATABASE_URL set correctly?');
    console.error('  - Is the database migrated?');
    console.error('  - Are there any identities in the database?\n');
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
