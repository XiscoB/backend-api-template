#!/usr/bin/env node

if (process.env.NODE_ENV === 'production') {
  if (!process.env.ALLOW_DEV_DESTRUCTIVE) {
    console.error('❌ Refusing to run in production environment.');
    console.error('   Set ALLOW_DEV_DESTRUCTIVE=1 to override.');
    process.exit(1);
  }
}

/**
 * Suspension Backup Test Script
 *
 * Tests that ALL user-owned tables are backed up during suspension,
 * including tables with indirect ownership (UserEmailChannel, UserPushChannel).
 *
 * This validates the fix for the bug where DELETE-strategy tables
 * were being deleted WITHOUT backup.
 *
 * Core invariant being tested:
 *   "All user-owned rows must be backed up before modification, regardless of strategy."
 *
 * Usage:
 *   node scripts/test-suspension-backup.js
 *
 * Requirements:
 * - Run `npm run build` first
 * - DATABASE_URL environment variable must be set
 *
 * What this tests:
 * 1. Creates a test identity with full notification setup
 * 2. Creates UserNotificationProfile + UserEmailChannel + UserPushChannel
 * 3. Triggers suspension
 * 4. Verifies ALL tables created backup entries
 * 5. Verifies data was deleted/anonymized
 * 6. Tests recovery restores all data
 */

const { NestFactory } = require('@nestjs/core');
const { randomUUID } = require('crypto');

async function bootstrap() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Suspension Backup Test');
  console.log('  Validates: DELETE-strategy tables are BACKED UP + DELETED');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Import after potential build
  const { AppModule } = require('../../dist/app.module');

  // Create NestJS application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const { PrismaService } = require('../../dist/common/prisma/prisma.service');
    const prisma = app.get(PrismaService);

    // ═══════════════════════════════════════════════════════════════════
    // Step 0: Clean up any pending suspension requests from previous runs
    // ═══════════════════════════════════════════════════════════════════
    console.log('─────────────────────────────────────────────────');
    console.log('Step 0: Clean Up Previous Test Artifacts');
    console.log('─────────────────────────────────────────────────\n');

    const { GdprSuspensionService } = require('../../dist/modules/gdpr/gdpr-suspension.service');
    const gdprSuspensionService = app.get(GdprSuspensionService);

    // Process all pending suspensions from previous runs first
    let previouslyProcessed = 0;
    let batchProcessed;
    do {
      batchProcessed = await gdprSuspensionService.processPendingSuspensions(10);
      previouslyProcessed += batchProcessed;
    } while (batchProcessed > 0);

    if (previouslyProcessed > 0) {
      console.log(`✓ Processed ${previouslyProcessed} pending requests from previous runs\n`);
    } else {
      console.log(`✓ No pending requests from previous runs\n`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Step 1: Create test identity with full notification setup
    // ═══════════════════════════════════════════════════════════════════
    console.log('─────────────────────────────────────────────────');
    console.log('Step 1: Create Test Identity with Notification Channels');
    console.log('─────────────────────────────────────────────────\n');

    // Use a proper UUID format for externalUserId (simulates Supabase/Auth provider user ID)
    const testExternalUserId = randomUUID();
    const testEmail = `test-${randomUUID().substring(0, 8)}@example.com`;

    // Create identity
    const identity = await prisma.identity.create({
      data: {
        externalUserId: testExternalUserId,
        isSuspended: false,
        anonymized: false,
      },
    });
    console.log(`✓ Created Identity: ${identity.id}`);

    // Create profile
    const profile = await prisma.profile.create({
      data: {
        identityId: identity.id,
        displayName: 'Test User for Suspension Backup',
        language: 'en',
      },
    });
    console.log(`✓ Created Profile: ${profile.id}`);

    // Create UserNotificationProfile
    const notificationProfile = await prisma.userNotificationProfile.create({
      data: {
        identityId: identity.id,
        notificationsEnabled: true,
        language: 'en',
      },
    });
    console.log(`✓ Created UserNotificationProfile: ${notificationProfile.id}`);

    // Create UserEmailChannel
    const emailChannel = await prisma.userEmailChannel.create({
      data: {
        notificationProfileId: notificationProfile.id,
        email: testEmail,
        enabled: true,
        promoEnabled: false,
        unsubscribeToken: randomUUID(),
      },
    });
    console.log(`✓ Created UserEmailChannel: ${emailChannel.id}`);

    // Create UserPushChannel
    const pushChannel = await prisma.userPushChannel.create({
      data: {
        notificationProfileId: notificationProfile.id,
        expoToken: `ExponentPushToken[test-${randomUUID().substring(0, 16)}]`,
        uniqueKey: `device-${randomUUID().substring(0, 8)}`,
        platform: 'ios',
        isActive: true,
      },
    });
    console.log(`✓ Created UserPushChannel: ${pushChannel.id}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // Step 2: Create GDPR suspension request
    // ═══════════════════════════════════════════════════════════════════
    console.log('─────────────────────────────────────────────────');
    console.log('Step 2: Create GDPR Suspension Request');
    console.log('─────────────────────────────────────────────────\n');

    // gdprSuspensionService was already loaded in Step 0
    const suspensionRequest = await gdprSuspensionService.requestSuspension(
      testExternalUserId, // Uses externalUserId, not identityId
    );
    console.log(`✓ Suspension request created: ${suspensionRequest.id}`);
    console.log(`  Status: ${suspensionRequest.status}\n`);

    // ═══════════════════════════════════════════════════════════════════
    // Step 3: Process the suspension request
    // ═══════════════════════════════════════════════════════════════════
    console.log('─────────────────────────────────────────────────');
    console.log('Step 3: Process Suspension Request');
    console.log('─────────────────────────────────────────────────\n');

    // processPendingSuspensions is on GdprSuspensionService, not GdprRequestProcessorService
    const processed = await gdprSuspensionService.processPendingSuspensions(1);
    console.log(`✓ Processing completed: ${processed} request(s) processed\n`);

    // ═══════════════════════════════════════════════════════════════════
    // Step 4: Verify backups were created
    // ═══════════════════════════════════════════════════════════════════
    console.log('─────────────────────────────────────────────────');
    console.log('Step 4: Verify Backup Creation');
    console.log('─────────────────────────────────────────────────\n');

    const backups = await prisma.suspensionBackup.findMany({
      where: { identityId: identity.id },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`✓ Found ${backups.length} backup entries:\n`);

    const expectedTables = [
      'Profile',
      'UserNotificationProfile',
      'UserEmailChannel',
      'UserPushChannel',
    ];

    const backedUpTables = backups.map((b) => b.tableName);

    for (const backup of backups) {
      const dataArray = Array.isArray(backup.backupData) ? backup.backupData : [backup.backupData];
      console.log(`  ✓ ${backup.tableName}: ${dataArray.length} row(s) backed up`);
    }
    console.log('');

    // Check for missing tables
    const missingTables = expectedTables.filter((t) => !backedUpTables.includes(t));
    if (missingTables.length > 0) {
      console.log('❌ MISSING BACKUPS for tables:');
      for (const table of missingTables) {
        console.log(`   - ${table}`);
      }
      console.log('');
    }

    // ═══════════════════════════════════════════════════════════════════
    // Step 5: Verify data was deleted/anonymized
    // ═══════════════════════════════════════════════════════════════════
    console.log('─────────────────────────────────────────────────');
    console.log('Step 5: Verify Data Was Deleted/Anonymized');
    console.log('─────────────────────────────────────────────────\n');

    // Check Profile (should be anonymized, not deleted)
    const profileAfter = await prisma.profile.findUnique({
      where: { identityId: identity.id },
    });
    if (profileAfter) {
      const isAnonymized =
        profileAfter.displayName.startsWith('anon_') ||
        profileAfter.displayName.includes('[SUSPENDED]');
      console.log(
        `  Profile: ${isAnonymized ? '✓ ANONYMIZED' : '⚠ EXISTS (displayName: ' + profileAfter.displayName + ')'}`,
      );
    } else {
      console.log(`  Profile: ✓ DELETED (if DELETE strategy)`);
    }

    // Check UserNotificationProfile (should be deleted)
    const notifProfileAfter = await prisma.userNotificationProfile.findUnique({
      where: { identityId: identity.id },
    });
    console.log(
      `  UserNotificationProfile: ${notifProfileAfter ? '❌ STILL EXISTS' : '✓ DELETED'}`,
    );

    // Check UserEmailChannel (should be deleted via cascade or direct)
    const emailChannelAfter = await prisma.userEmailChannel.findUnique({
      where: { id: emailChannel.id },
    });
    console.log(`  UserEmailChannel: ${emailChannelAfter ? '❌ STILL EXISTS' : '✓ DELETED'}`);

    // Check UserPushChannel (should be deleted via cascade or direct)
    const pushChannelAfter = await prisma.userPushChannel.findUnique({
      where: { id: pushChannel.id },
    });
    console.log(`  UserPushChannel: ${pushChannelAfter ? '❌ STILL EXISTS' : '✓ DELETED'}`);

    console.log('');

    // ═══════════════════════════════════════════════════════════════════
    // Step 6: Test recovery
    // ═══════════════════════════════════════════════════════════════════
    console.log('─────────────────────────────────────────────────');
    console.log('Step 6: Test Recovery (Resume)');
    console.log('─────────────────────────────────────────────────\n');

    try {
      const resumeResult = await gdprSuspensionService.resumeAccount(testExternalUserId);
      console.log(`✓ Resume completed: ${resumeResult.status}`);

      // Verify data was restored
      const profileRestored = await prisma.profile.findUnique({
        where: { identityId: identity.id },
      });
      const notifProfileRestored = await prisma.userNotificationProfile.findUnique({
        where: { identityId: identity.id },
      });
      const emailChannelRestored = await prisma.userEmailChannel.findFirst({
        where: { notificationProfileId: notifProfileRestored?.id ?? '' },
      });
      const pushChannelRestored = await prisma.userPushChannel.findFirst({
        where: { notificationProfileId: notifProfileRestored?.id ?? '' },
      });

      console.log(`  Profile restored: ${profileRestored ? '✓' : '❌'}`);
      console.log(`  UserNotificationProfile restored: ${notifProfileRestored ? '✓' : '❌'}`);
      console.log(`  UserEmailChannel restored: ${emailChannelRestored ? '✓' : '❌'}`);
      console.log(`  UserPushChannel restored: ${pushChannelRestored ? '✓' : '❌'}`);
    } catch (recoveryError) {
      console.log(`⚠ Recovery not available or failed: ${recoveryError.message}`);
    }

    console.log('');

    // ═══════════════════════════════════════════════════════════════════
    // Final Summary
    // ═══════════════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Test Summary');
    console.log('═══════════════════════════════════════════════════════════');

    const allExpectedBacked = expectedTables.every((t) => backedUpTables.includes(t));

    console.log(`  Identity ID:        ${identity.id}`);
    console.log(`  Backup entries:     ${backups.length}`);
    console.log(`  Expected tables:    ${expectedTables.length}`);
    console.log(`  All backed up:      ${allExpectedBacked ? '✓ YES' : '❌ NO'}`);

    if (!allExpectedBacked) {
      console.log(`  Missing backups:    ${missingTables.join(', ')}`);
    }

    console.log('═══════════════════════════════════════════════════════════\n');

    if (allExpectedBacked) {
      console.log('✓ TEST PASSED: All tables were backed up before processing!\n');
      process.exit(0);
    } else {
      console.log('❌ TEST FAILED: Some tables were NOT backed up!\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Test failed with error:');
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
