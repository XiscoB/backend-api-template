/**
 * GDPR Integration Tests - Suspension/Recovery Safety
 *
 * These tests protect GDPR runtime invariants:
 * 1. Indirect ownership tables are backed up, deleted, and restored correctly
 * 2. CASCADE deletes do not remove child data before backup
 *
 * PURPOSE: Lock GDPR guarantees with automated tests.
 * These tests require a running database connection.
 *
 * CRITICAL: This file tests ONLY. No production code changes.
 *
 * REQUIREMENTS:
 * - PostgreSQL database must be running
 * - DATABASE_URL must be set (see setup-auth.ts)
 * - Run with: npm run test:e2e -- --testPathPattern="gdpr-structural-safety"
 */

// MUST be imported first - sets environment variables
import { TEST_PRIVATE_KEY } from './setup-auth';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { GdprSuspensionService } from '../src/modules/gdpr/gdpr-suspension.service';

// Note: TEST_PRIVATE_KEY is imported for test infrastructure
void TEST_PRIVATE_KEY;

// ─────────────────────────────────────────────────────────────
// Test Suite: GDPR Integration Tests (Database Required)
// ─────────────────────────────────────────────────────────────

describe('GDPR Integration Tests (Database Required)', () => {
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

    // Clean up any pending suspensions from previous runs
    // let cleaned = 0;
    let batch;
    do {
      batch = await gdprSuspensionService.processPendingSuspensions(10);
      // cleaned += batch;
    } while (batch > 0);
  });

  afterAll(async () => {
    // Clean up test identities (cascades to all related records)
    for (const identityId of createdIdentityIds) {
      try {
        // Delete backups first
        await prisma.suspensionBackup.deleteMany({
          where: { identityId },
        });
        // Delete suspensions
        await prisma.accountSuspension.deleteMany({
          where: { identityId },
        });
        // Delete identity (cascades to profile, notifications, etc.)
        await prisma.identity
          .delete({
            where: { id: identityId },
          })
          .catch(() => {
            /* Already deleted */
          });
      } catch {
        // Ignore cleanup errors
      }
    }

    await app.close();
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Suite 1: Indirect Ownership Backup Test
  // ═══════════════════════════════════════════════════════════════════

  describe('1️⃣ Indirect Ownership Backup Test', () => {
    /**
     * Purpose: Ensure tables with indirect ownership (via foreign keys)
     * are backed up, deleted, and restored correctly.
     *
     * Tables tested:
     * - UserEmailChannel (references UserNotificationProfile.id, not Identity.id)
     * - UserPushChannel (references UserNotificationProfile.id, not Identity.id)
     */

    let testIdentityId: string;
    let testExternalUserId: string;
    let testNotificationProfileId: string;
    let testEmailChannelId: string;
    let testPushChannelId: string;
    let originalEmailData: { email: string; unsubscribeToken: string };
    let originalPushData: { expoToken: string; uniqueKey: string };

    beforeAll(async () => {
      // Create test identity with full notification setup
      testExternalUserId = randomUUID();
      const testEmail = `indirect-test-${randomUUID().substring(0, 8)}@example.com`;

      // Create identity
      const identity = await prisma.identity.create({
        data: {
          externalUserId: testExternalUserId,
          isSuspended: false,
          anonymized: false,
        },
      });
      testIdentityId = identity.id;
      createdIdentityIds.push(identity.id);

      // Create profile
      await prisma.profile.create({
        data: {
          identityId: identity.id,
          displayName: 'Indirect Ownership Test User',
          language: 'en',
        },
      });

      // Create UserNotificationProfile (parent)
      const notificationProfile = await prisma.userNotificationProfile.create({
        data: {
          identityId: identity.id,
          notificationsEnabled: true,
          language: 'en',
        },
      });
      testNotificationProfileId = notificationProfile.id;

      // Create UserEmailChannel (child - indirect ownership)
      originalEmailData = {
        email: testEmail,
        unsubscribeToken: randomUUID(),
      };
      const emailChannel = await prisma.userEmailChannel.create({
        data: {
          notificationProfileId: notificationProfile.id,
          email: originalEmailData.email,
          enabled: true,
          promoEnabled: false,
          unsubscribeToken: originalEmailData.unsubscribeToken,
        },
      });
      testEmailChannelId = emailChannel.id;

      // Create UserPushChannel (child - indirect ownership)
      originalPushData = {
        expoToken: `ExponentPushToken[indirect-${randomUUID().substring(0, 16)}]`,
        uniqueKey: `device-${randomUUID().substring(0, 8)}`,
      };
      const pushChannel = await prisma.userPushChannel.create({
        data: {
          notificationProfileId: notificationProfile.id,
          expoToken: originalPushData.expoToken,
          uniqueKey: originalPushData.uniqueKey,
          platform: 'ios',
          isActive: true,
        },
      });
      testPushChannelId = pushChannel.id;
    });

    it('should create backups for all tables including indirect ownership', async () => {
      // Request and process suspension
      const suspensionRequest = await gdprSuspensionService.requestSuspension(testExternalUserId);
      expect(suspensionRequest.status).toBe('PENDING');

      const processed = await gdprSuspensionService.processPendingSuspensions(1);
      expect(processed).toBe(1);

      // Verify backups exist for all expected tables
      const backups = await prisma.suspensionBackup.findMany({
        where: { identityId: testIdentityId },
      });

      const backedUpTables = backups.map((b) => b.tableName);

      // Core assertion: All user-owned tables must have backups
      expect(backedUpTables).toContain('Profile');
      expect(backedUpTables).toContain('UserNotificationProfile');
      expect(backedUpTables).toContain('UserEmailChannel');
      expect(backedUpTables).toContain('UserPushChannel');
    });

    it('should have empty live tables after suspension', async () => {
      // Verify UserEmailChannel is deleted
      const emailChannel = await prisma.userEmailChannel.findUnique({
        where: { id: testEmailChannelId },
      });
      expect(emailChannel).toBeNull();

      // Verify UserPushChannel is deleted
      const pushChannel = await prisma.userPushChannel.findUnique({
        where: { id: testPushChannelId },
      });
      expect(pushChannel).toBeNull();

      // Verify UserNotificationProfile is deleted
      const notificationProfile = await prisma.userNotificationProfile.findUnique({
        where: { identityId: testIdentityId },
      });
      expect(notificationProfile).toBeNull();
    });

    it('should restore all data with FK integrity preserved on recovery', async () => {
      // Recover account
      const recoverResult = await gdprSuspensionService.recoverAccount(testExternalUserId);
      expect(recoverResult.identityId).toBeDefined();
      expect(recoverResult.recoveredAt).toBeDefined();

      // Verify UserNotificationProfile restored
      const notificationProfile = await prisma.userNotificationProfile.findUnique({
        where: { identityId: testIdentityId },
      });
      expect(notificationProfile).not.toBeNull();
      expect(notificationProfile?.id).toBe(testNotificationProfileId);

      // Verify UserEmailChannel restored with original data
      const emailChannel = await prisma.userEmailChannel.findFirst({
        where: { notificationProfileId: testNotificationProfileId },
      });
      expect(emailChannel).not.toBeNull();
      expect(emailChannel?.email).toBe(originalEmailData.email);
      expect(emailChannel?.unsubscribeToken).toBe(originalEmailData.unsubscribeToken);

      // Verify UserPushChannel restored with original data
      const pushChannel = await prisma.userPushChannel.findFirst({
        where: { notificationProfileId: testNotificationProfileId },
      });
      expect(pushChannel).not.toBeNull();
      expect(pushChannel?.expoToken).toBe(originalPushData.expoToken);
      expect(pushChannel?.uniqueKey).toBe(originalPushData.uniqueKey);

      // Verify FK integrity: child tables reference the same parent
      expect(emailChannel?.notificationProfileId).toBe(testNotificationProfileId);
      expect(pushChannel?.notificationProfileId).toBe(testNotificationProfileId);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Suite 2: CASCADE Safety Test
  // ═══════════════════════════════════════════════════════════════════

  describe('2️⃣ CASCADE Safety Test', () => {
    /**
     * Purpose: Ensure CASCADE deletes do not remove child data before backup.
     *
     * The GDPR system processes tables in CHILD-FIRST order to prevent
     * CASCADE deletes from removing child rows before they're backed up.
     *
     * This test validates:
     * - Child tables (UserEmailChannel, UserPushChannel) produce non-zero backup rows
     * - Even though parent table (UserNotificationProfile) has onDelete: CASCADE
     */

    let testIdentityId: string;
    let testExternalUserId: string;
    let originalEmailCount: number;
    let originalPushCount: number;

    beforeAll(async () => {
      // Create test identity with multiple child records
      testExternalUserId = randomUUID();
      const testEmailBase = `cascade-test-${randomUUID().substring(0, 8)}`;

      // Create identity
      const identity = await prisma.identity.create({
        data: {
          externalUserId: testExternalUserId,
          isSuspended: false,
          anonymized: false,
        },
      });
      testIdentityId = identity.id;
      createdIdentityIds.push(identity.id);

      // Create profile
      await prisma.profile.create({
        data: {
          identityId: identity.id,
          displayName: 'CASCADE Safety Test User',
          language: 'en',
        },
      });

      // Create UserNotificationProfile (parent with onDelete: CASCADE)
      const notificationProfile = await prisma.userNotificationProfile.create({
        data: {
          identityId: identity.id,
          notificationsEnabled: true,
          language: 'en',
        },
      });

      // Create MULTIPLE email channels to test row count
      await prisma.userEmailChannel.createMany({
        data: [
          {
            notificationProfileId: notificationProfile.id,
            email: `${testEmailBase}-1@example.com`,
            enabled: true,
            promoEnabled: false,
            unsubscribeToken: randomUUID(),
          },
          {
            notificationProfileId: notificationProfile.id,
            email: `${testEmailBase}-2@example.com`,
            enabled: true,
            promoEnabled: true,
            unsubscribeToken: randomUUID(),
          },
        ],
      });
      originalEmailCount = 2;

      // Create MULTIPLE push channels to test row count
      await prisma.userPushChannel.createMany({
        data: [
          {
            notificationProfileId: notificationProfile.id,
            expoToken: `ExponentPushToken[cascade-${randomUUID().substring(0, 16)}]`,
            uniqueKey: `device-${randomUUID().substring(0, 8)}`,
            platform: 'ios',
            isActive: true,
          },
          {
            notificationProfileId: notificationProfile.id,
            expoToken: `ExponentPushToken[cascade-${randomUUID().substring(0, 16)}]`,
            uniqueKey: `device-${randomUUID().substring(0, 8)}`,
            platform: 'android',
            isActive: true,
          },
        ],
      });
      originalPushCount = 2;
    });

    it('should backup child tables BEFORE CASCADE could delete them', async () => {
      // Request and process suspension
      const suspensionRequest = await gdprSuspensionService.requestSuspension(testExternalUserId);
      expect(suspensionRequest.status).toBe('PENDING');

      const processed = await gdprSuspensionService.processPendingSuspensions(1);
      expect(processed).toBe(1);

      // Verify backups exist for child tables
      const backups = await prisma.suspensionBackup.findMany({
        where: { identityId: testIdentityId },
      });

      // Find child table backups
      const emailBackup = backups.find((b) => b.tableName === 'UserEmailChannel');
      const pushBackup = backups.find((b) => b.tableName === 'UserPushChannel');

      // Core assertion: Child table backups must exist and contain rows
      expect(emailBackup).toBeDefined();
      expect(pushBackup).toBeDefined();

      // Verify backup contains the correct number of rows
      const emailBackupData = emailBackup?.backupData as unknown[];
      const pushBackupData = pushBackup?.backupData as unknown[];

      expect(Array.isArray(emailBackupData)).toBe(true);
      expect(Array.isArray(pushBackupData)).toBe(true);

      // CRITICAL: Child table backups must NOT be empty
      // If CASCADE deleted them before backup, this would fail
      expect(emailBackupData.length).toBe(originalEmailCount);
      expect(pushBackupData.length).toBe(originalPushCount);
    });

    it('should not produce "0 rows" backup for tables that had data pre-suspension', async () => {
      // Get all backups for this identity
      const backups = await prisma.suspensionBackup.findMany({
        where: { identityId: testIdentityId },
      });

      // For each backup, if it exists, it should have non-empty data
      // Empty arrays indicate CASCADE deleted before backup
      for (const backup of backups) {
        // Backup data should be an array
        expect(Array.isArray(backup.backupData)).toBe(true);

        // Tables that HAD rows should not have empty backups
        // Note: We check that known populated tables are not empty
        if (
          ['UserEmailChannel', 'UserPushChannel', 'Profile', 'UserNotificationProfile'].includes(
            backup.tableName,
          )
        ) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const dataArray = backup.backupData as any[];
          expect(dataArray.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
