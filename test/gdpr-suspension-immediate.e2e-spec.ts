/**
 * GDPR Suspension Immediate Risky-Data Deletion Tests
 *
 * Verifies the hybrid suspension model:
 * 1. Immediate backup + DELETE of risky tables (T+0)
 * 2. Deferred processing of remaining tables (Cron)
 * 3. Suspension UID immutability
 *
 * REQUIREMENTS:
 * - PostgreSQL database must be running
 * - DATABASE_URL must be set
 * - Run with: npm run test:e2e -- --testPathPattern="gdpr-suspension-immediate"
 */

import { TEST_PRIVATE_KEY } from './setup-auth';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { GdprSuspensionService } from '../src/modules/gdpr/gdpr-suspension.service';

// Note: TEST_PRIVATE_KEY is imported for test infrastructure
void TEST_PRIVATE_KEY;

describe('GDPR Suspension Immediate Risky-Data Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gdprSuspensionService: GdprSuspensionService;

  // Track created resources for cleanup
  const createdIdentityIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    gdprSuspensionService = app.get(GdprSuspensionService);
  });

  afterAll(async () => {
    // Clean up
    for (const identityId of createdIdentityIds) {
      try {
        await prisma.suspensionBackup.deleteMany({ where: { identityId } });
        await prisma.accountSuspension.deleteMany({ where: { identityId } });
        await prisma.identity.delete({ where: { id: identityId } }).catch(() => {});
      } catch (e) {
        console.error('Cleanup failed for identity', identityId, e);
      }
    }
    await app.close();
  });

  it('should immediately delete risky tables and preserve suspensionUid', async () => {
    // 1. Setup: Create User + Risky Data
    const externalUserId = `test-suspension-${randomUUID()}`;
    const email = `test-${randomUUID()}@example.com`;

    // Create Identity
    const identity = await prisma.identity.create({
      data: {
        externalUserId,
      },
    });
    createdIdentityIds.push(identity.id);

    // Create Notification Profile (Risky)
    const profile = await prisma.userNotificationProfile.create({
      data: {
        identityId: identity.id,
        notificationsEnabled: true,
      },
    });

    // Create Email Channel (Risky - delivery tokens)
    await prisma.userEmailChannel.create({
      data: {
        notificationProfileId: profile.id,
        email: email,
        enabled: true,
        unsubscribeToken: randomUUID(),
      },
    });

    // Create Push Channel (Risky - push tokens)
    await prisma.userPushChannel.create({
      data: {
        notificationProfileId: profile.id,
        expoToken: `ExponentPushToken[test-${randomUUID().substring(0, 16)}]`,
        uniqueKey: `device-${randomUUID().substring(0, 8)}`,
        platform: 'ios',
        isActive: true,
      },
    });

    // Create Scheduled Notification (Risky - future send)
    await prisma.scheduledNotification.create({
      data: {
        identityId: identity.id,
        type: 'MARKETING_PROMO',
        payload: { promo: 'free-stuff' },
        scheduledAt: new Date(Date.now() + 86400000), // Tomorrow
        status: 'PENDING',
      },
    });

    // Create Profile (Deferred - should NOT be deleted at T+0)
    await prisma.profile.create({
      data: {
        identityId: identity.id,
        displayName: 'Test User',
        language: 'en',
      },
    });

    // 2. Action: Request Suspension
    const request = await gdprSuspensionService.requestSuspension(externalUserId);

    // 3. Verify Immediate Effects (T+0)

    // GDPR request created with PENDING status
    expect(request.status).toBe('PENDING');

    // Identity suspended immediately
    const updatedIdentity = await prisma.identity.findUnique({ where: { id: identity.id } });
    expect(updatedIdentity?.isSuspended).toBe(true);

    // Suspension record created
    const suspension = await prisma.accountSuspension.findFirst({
      where: { identityId: identity.id },
    });
    expect(suspension).toBeDefined();
    const originalSuspensionUid = suspension!.suspensionUid;
    expect(originalSuspensionUid).toBeDefined();

    // Risky tables DELETED (not cancelled, deleted)
    const profileCheck = await prisma.userNotificationProfile.findFirst({
      where: { identityId: identity.id },
    });
    expect(profileCheck).toBeNull(); // Deleted

    const emailChannelCheck = await prisma.userEmailChannel.findFirst({
      where: { notificationProfileId: profile.id },
    });
    expect(emailChannelCheck).toBeNull(); // Deleted - IMMEDIATE risk

    const pushChannelCheck = await prisma.userPushChannel.findFirst({
      where: { notificationProfileId: profile.id },
    });
    expect(pushChannelCheck).toBeNull(); // Deleted - IMMEDIATE risk

    const scheduleCheck = await prisma.scheduledNotification.findFirst({
      where: { identityId: identity.id },
    });
    expect(scheduleCheck).toBeNull(); // Deleted - IMMEDIATE risk

    // Deferred tables should STILL EXIST at T+0
    const profileBeforeCron = await prisma.profile.findUnique({
      where: { identityId: identity.id },
    });
    expect(profileBeforeCron).not.toBeNull(); // Still exists - DEFERRED

    // Backups exist for risky tables
    const backups = await prisma.suspensionBackup.findMany({
      where: { suspensionUid: originalSuspensionUid },
    });
    const backupTables = backups.map((b) => b.tableName);
    expect(backupTables).toContain('UserNotificationProfile');
    // Note: Channels might be nested in profile backup or separate depending on implementation
    // But ScheduledNotification should definitely be backed up
    expect(backupTables).toContain('ScheduledNotification');

    // 4. Verify Deferred Effects (Cron Simulation)

    // Call worker to process deferred tables
    await gdprSuspensionService.processPendingSuspensions(1);

    // Verify suspension UID is UNCHANGED (Immutability Check)
    const finalSuspension = await prisma.accountSuspension.findFirst({
      where: { identityId: identity.id },
    });
    expect(finalSuspension?.suspensionUid).toBe(originalSuspensionUid);
    expect(finalSuspension?.lifecycleState).toBe('SUSPENDED');

    // Verify request is completed
    const finalRequest = await prisma.request.findUnique({ where: { id: request.id } });
    expect(finalRequest?.status).toBe('COMPLETED');
  });

  /**
   * REGRESSION TEST: Verify recovery is blocked during SUSPENDING state
   *
   * This test reproduces the bug where partial suspension allowed premature recovery.
   * The fix introduces SUSPENDING as a transitional state that blocks recovery
   * until the suspension job fully completes.
   */
  it('should block recovery during SUSPENDING state', async () => {
    // 1. Setup: Create user
    const externalUserId = `test-suspending-block-${randomUUID()}`;

    const identity = await prisma.identity.create({
      data: { externalUserId },
    });
    createdIdentityIds.push(identity.id);

    // Create Profile (DEFERRED table - will be processed by cron)
    await prisma.profile.create({
      data: {
        identityId: identity.id,
        displayName: 'Test User',
        language: 'en',
      },
    });

    // 2. Request suspension - puts into SUSPENDING state
    await gdprSuspensionService.requestSuspension(externalUserId);

    // 3. Verify state is SUSPENDING (before cron processes)
    const suspensionBeforeCron = await prisma.accountSuspension.findFirst({
      where: { identityId: identity.id },
    });
    expect(suspensionBeforeCron?.lifecycleState).toBe('SUSPENDING');

    // 4. Attempt recovery - should FAIL with specific error message
    await expect(gdprSuspensionService.recoverAccount(externalUserId)).rejects.toThrow(
      'suspension is still in progress',
    );

    // 5. Process suspension (cron) - transitions to SUSPENDED
    await gdprSuspensionService.processPendingSuspensions(1);

    // 6. Verify state is now SUSPENDED
    const suspensionAfterCron = await prisma.accountSuspension.findFirst({
      where: { identityId: identity.id },
    });
    expect(suspensionAfterCron?.lifecycleState).toBe('SUSPENDED');

    // 7. Recovery should now work
    const result = await gdprSuspensionService.recoverAccount(externalUserId);
    expect(result.suspensionUid).toBe(suspensionBeforeCron?.suspensionUid);

    // 8. Verify final state is RECOVERED
    const suspensionAfterRecovery = await prisma.accountSuspension.findFirst({
      where: { identityId: identity.id },
    });
    expect(suspensionAfterRecovery?.lifecycleState).toBe('RECOVERED');
  });
});
