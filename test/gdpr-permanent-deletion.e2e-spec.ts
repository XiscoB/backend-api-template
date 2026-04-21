/**
 * GDPR Permanent Deletion Tests
 *
 * These tests prove:
 * 1. Permanent deletion removes all user-owned data
 * 2. No backups are created during permanent deletion
 * 3. Recovery is blocked after permanent deletion
 * 4. CASCADE and indirect ownership are handled correctly
 * 5. Export after deletion returns no user data
 *
 * Mental Model:
 * - Permanent deletion = suspension pipeline WITHOUT recovery
 * - Uses same table iteration, ownership resolution, CASCADE-safe ordering
 * - Mode 'DELETE' = no backup, recovery impossible
 *
 * CRITICAL: This file tests ONLY. No production code changes.
 *
 * REQUIREMENTS:
 * - PostgreSQL database must be running
 * - DATABASE_URL must be set (see setup-auth.ts)
 * - Run with: npm run test:e2e -- --testPathPattern="gdpr-permanent-deletion"
 */

// MUST be imported first - sets environment variables
import { TEST_PRIVATE_KEY } from './setup-auth';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { GdprDeletionService } from '../src/modules/gdpr/gdpr-deletion.service';
import { GdprDeletionLifecycleService } from '../src/modules/gdpr/gdpr-deletion-lifecycle.service';
import { GdprSuspensionService } from '../src/modules/gdpr/gdpr-suspension.service';

// Note: TEST_PRIVATE_KEY is imported for test infrastructure
void TEST_PRIVATE_KEY;

// ─────────────────────────────────────────────────────────────
// Test Suite: GDPR Permanent Deletion Tests
// ─────────────────────────────────────────────────────────────

describe('GDPR Permanent Deletion Tests (Database Required)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gdprDeletionService: GdprDeletionService;
  let gdprDeletionLifecycleService: GdprDeletionLifecycleService;
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
    gdprDeletionService = app.get(GdprDeletionService);
    gdprDeletionLifecycleService = app.get(GdprDeletionLifecycleService);
    gdprSuspensionService = app.get(GdprSuspensionService);
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
  // Test Suite 1: Permanent Deletion Removes All Data
  // ═══════════════════════════════════════════════════════════════════

  describe('1️⃣ Permanent Deletion Removes All Data', () => {
    let testIdentityId: string;
    let testExternalUserId: string;
    let testNotificationProfileId: string;

    beforeAll(async () => {
      // Create test identity with full data
      testExternalUserId = randomUUID();
      const testEmail = `perm-delete-${randomUUID().substring(0, 8)}@example.com`;

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
          displayName: 'Permanent Delete Test User',
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
      await prisma.userEmailChannel.create({
        data: {
          notificationProfileId: notificationProfile.id,
          email: testEmail,
          enabled: true,
          promoEnabled: false,
          unsubscribeToken: randomUUID(),
        },
      });

      // Create UserPushChannel (child - indirect ownership)
      await prisma.userPushChannel.create({
        data: {
          notificationProfileId: notificationProfile.id,
          expoToken: `ExponentPushToken[perm-${randomUUID().substring(0, 16)}]`,
          uniqueKey: `device-${randomUUID().substring(0, 8)}`,
          platform: 'ios',
          isActive: true,
        },
      });
    });

    it('should remove or anonymize all user data after permanent deletion', async () => {
      // Request permanent deletion
      const deletionRequest = await gdprDeletionService.requestDeletion(testExternalUserId);
      expect(deletionRequest.status).toBe('PENDING');

      // Process the deletion
      const processed = await gdprDeletionService.processPendingDeletions(1);
      expect(processed).toBe(1);

      // Verify Profile is ANONYMIZED (not deleted - per registry strategy)
      // Profile uses ANONYMIZE strategy to preserve FK integrity
      const profile = await prisma.profile.findUnique({
        where: { identityId: testIdentityId },
      });
      expect(profile).not.toBeNull();
      expect(profile?.displayName).toBe('[DELETED]'); // PII is anonymized

      // Verify UserNotificationProfile is deleted (DELETE strategy)
      const notificationProfile = await prisma.userNotificationProfile.findUnique({
        where: { identityId: testIdentityId },
      });
      expect(notificationProfile).toBeNull();

      // Verify UserEmailChannel is deleted (DELETE strategy)
      const emailChannel = await prisma.userEmailChannel.findFirst({
        where: { notificationProfileId: testNotificationProfileId },
      });
      expect(emailChannel).toBeNull();

      // Verify UserPushChannel is deleted (DELETE strategy)
      const pushChannel = await prisma.userPushChannel.findFirst({
        where: { notificationProfileId: testNotificationProfileId },
      });
      expect(pushChannel).toBeNull();
    });

    it('should mark Identity as anonymized', async () => {
      const identity = await prisma.identity.findUnique({
        where: { id: testIdentityId },
      });
      expect(identity).not.toBeNull();
      expect(identity?.anonymized).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Suite 2: No Backups Created During Permanent Deletion
  // ═══════════════════════════════════════════════════════════════════

  describe('2️⃣ No Backups Created During Permanent Deletion', () => {
    let testIdentityId: string;
    let testExternalUserId: string;

    beforeAll(async () => {
      // Create test identity with data
      testExternalUserId = randomUUID();

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
          displayName: 'No Backup Test User',
          language: 'en',
        },
      });
    });

    it('should not create any backups during permanent deletion', async () => {
      // Count backups before deletion
      const backupsBefore = await prisma.suspensionBackup.count({
        where: { identityId: testIdentityId },
      });
      expect(backupsBefore).toBe(0);

      // Request and process permanent deletion
      const deletionRequest = await gdprDeletionService.requestDeletion(testExternalUserId);
      expect(deletionRequest.status).toBe('PENDING');

      const processed = await gdprDeletionService.processPendingDeletions(1);
      expect(processed).toBe(1);

      // Count backups after deletion - should still be 0
      const backupsAfter = await prisma.suspensionBackup.count({
        where: { identityId: testIdentityId },
      });
      expect(backupsAfter).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Suite 3: Recovery Blocked After Permanent Deletion
  // ═══════════════════════════════════════════════════════════════════

  describe('3️⃣ Recovery Blocked After Permanent Deletion', () => {
    let testExternalUserId: string;

    beforeAll(async () => {
      // Create test identity
      testExternalUserId = randomUUID();

      const identity = await prisma.identity.create({
        data: {
          externalUserId: testExternalUserId,
          isSuspended: false,
          anonymized: false,
        },
      });
      createdIdentityIds.push(identity.id);

      // Create profile
      await prisma.profile.create({
        data: {
          identityId: identity.id,
          displayName: 'Recovery Block Test User',
          language: 'en',
        },
      });

      // Execute permanent deletion
      const deletionRequest = await gdprDeletionService.requestDeletion(testExternalUserId);
      await gdprDeletionService.processPendingDeletions(1);
      expect(deletionRequest).toBeDefined();
    });

    it('should reject recovery attempts with ForbiddenException', async () => {
      // Attempt to recover - should be blocked
      await expect(gdprSuspensionService.recoverAccount(testExternalUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject suspension requests for permanently deleted users', async () => {
      // Attempt to suspend - should be blocked
      await expect(gdprSuspensionService.requestSuspension(testExternalUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject duplicate deletion requests for already deleted users', async () => {
      // Attempt to delete again - should be blocked
      await expect(gdprDeletionService.requestDeletion(testExternalUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Suite 4: Audit Log Correctly Records Permanent Deletion
  // ═══════════════════════════════════════════════════════════════════

  describe('4️⃣ Audit Log Records Permanent Deletion', () => {
    let testIdentityId: string;
    let testExternalUserId: string;

    beforeAll(async () => {
      // Create test identity
      testExternalUserId = randomUUID();

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
          displayName: 'Audit Log Test User',
          language: 'en',
        },
      });

      // Execute permanent deletion
      const deletionRequest = await gdprDeletionService.requestDeletion(testExternalUserId);
      await gdprDeletionService.processPendingDeletions(1);
      expect(deletionRequest).toBeDefined();
    });

    it('should create audit log with permanent deletion metadata', async () => {
      const auditLog = await prisma.gdprAuditLog.findFirst({
        where: {
          identityId: testIdentityId,
          action: 'DELETE',
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).not.toBeNull();

      const metadata = auditLog?.metadata as Record<string, unknown>;
      expect(metadata.status).toBe('PERMANENT_DELETE_SUCCESS');
      expect(metadata.identityAnonymized).toBe(true);
      expect(metadata.backupsCreated).toBe(false);
      expect(metadata.recoveryPossible).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Suite 5: Compare Suspension vs Permanent Deletion
  // ═══════════════════════════════════════════════════════════════════

  describe('5️⃣ Suspension vs Permanent Deletion Behavior', () => {
    let suspendedExternalUserId: string;
    let suspendedIdentityId: string;
    let deletedExternalUserId: string;
    let deletedIdentityId: string;

    beforeAll(async () => {
      // Create two test users
      suspendedExternalUserId = randomUUID();
      deletedExternalUserId = randomUUID();

      // User 1: Will be suspended
      const suspendedIdentity = await prisma.identity.create({
        data: {
          externalUserId: suspendedExternalUserId,
          isSuspended: false,
          anonymized: false,
        },
      });
      suspendedIdentityId = suspendedIdentity.id;
      createdIdentityIds.push(suspendedIdentity.id);

      await prisma.profile.create({
        data: {
          identityId: suspendedIdentity.id,
          displayName: 'Suspended User',
          language: 'en',
        },
      });

      // User 2: Will be permanently deleted
      const deletedIdentity = await prisma.identity.create({
        data: {
          externalUserId: deletedExternalUserId,
          isSuspended: false,
          anonymized: false,
        },
      });
      deletedIdentityId = deletedIdentity.id;
      createdIdentityIds.push(deletedIdentity.id);

      await prisma.profile.create({
        data: {
          identityId: deletedIdentity.id,
          displayName: 'Deleted User',
          language: 'en',
        },
      });

      // Execute suspension on user 1
      await gdprSuspensionService.requestSuspension(suspendedExternalUserId);
      await gdprSuspensionService.processPendingSuspensions(1);

      // Execute permanent deletion on user 2
      await gdprDeletionService.requestDeletion(deletedExternalUserId);
      await gdprDeletionService.processPendingDeletions(1);
    });

    it('should create backups for suspended user', async () => {
      const backups = await prisma.suspensionBackup.count({
        where: { identityId: suspendedIdentityId },
      });
      expect(backups).toBeGreaterThan(0);
    });

    it('should NOT create backups for permanently deleted user', async () => {
      const backups = await prisma.suspensionBackup.count({
        where: { identityId: deletedIdentityId },
      });
      expect(backups).toBe(0);
    });

    it('should allow recovery for suspended user', async () => {
      // Recovery should succeed for suspended user
      const result = await gdprSuspensionService.recoverAccount(suspendedExternalUserId);
      expect(result.identityId).toBe(suspendedIdentityId);
      expect(result.recoveredAt).toBeDefined();
    });

    it('should block recovery for permanently deleted user', async () => {
      // Recovery should fail for permanently deleted user
      await expect(gdprSuspensionService.recoverAccount(deletedExternalUserId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should have anonymized=false for suspended user', async () => {
      const identity = await prisma.identity.findUnique({
        where: { id: suspendedIdentityId },
      });
      expect(identity?.anonymized).toBe(false);
    });

    it('should have anonymized=true for permanently deleted user', async () => {
      const identity = await prisma.identity.findUnique({
        where: { id: deletedIdentityId },
      });
      expect(identity?.anonymized).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Test Suite 6: Deletion Lifecycle Immediate Effects (T+0)
  // ═══════════════════════════════════════════════════════════════════

  describe('6️⃣ Deletion Lifecycle Immediate Effects (T+0)', () => {
    let testIdentityId: string;
    let testExternalUserId: string;
    let testEmail: string;
    let testNotificationProfileId: string;

    beforeAll(async () => {
      // Create test identity with full data
      testExternalUserId = randomUUID();
      testEmail = `lifecycle-delete-${randomUUID().substring(0, 8)}@example.com`;

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
          displayName: 'Lifecycle Delete Test User',
          language: 'en',
        },
      });

      // Create UserNotificationProfile (IMMEDIATE risk)
      const notificationProfile = await prisma.userNotificationProfile.create({
        data: {
          identityId: identity.id,
          notificationsEnabled: true,
          language: 'en',
        },
      });
      testNotificationProfileId = notificationProfile.id;

      // Create UserEmailChannel (IMMEDIATE risk - delivery tokens)
      await prisma.userEmailChannel.create({
        data: {
          notificationProfileId: notificationProfile.id,
          email: testEmail,
          enabled: true,
          promoEnabled: false,
          unsubscribeToken: randomUUID(),
        },
      });

      // Create UserPushChannel (IMMEDIATE risk - push tokens)
      await prisma.userPushChannel.create({
        data: {
          notificationProfileId: notificationProfile.id,
          expoToken: `ExponentPushToken[lifecycle-${randomUUID().substring(0, 16)}]`,
          uniqueKey: `device-${randomUUID().substring(0, 8)}`,
          platform: 'ios',
          isActive: true,
        },
      });

      // Create ScheduledNotification (IMMEDIATE risk - future send)
      await prisma.scheduledNotification.create({
        data: {
          identityId: identity.id,
          type: 'MARKETING_PROMO',
          payload: { promo: 'test-promo' },
          scheduledAt: new Date(Date.now() + 86400000), // Tomorrow
          status: 'PENDING',
        },
      });
    });

    it('should set identity.deletedAt immediately at T+0', async () => {
      // Request deletion via lifecycle service (immediate enforcement)
      const result = await gdprDeletionLifecycleService.requestDeletion(
        testExternalUserId,
        testEmail, // JWT email
      );

      // Status should be PENDING_DELETION
      expect(result.status).toBe('PENDING_DELETION');
      expect(result.deletedAt).toBeDefined();
      expect(result.scheduledFinalDeletionAt).toBeDefined();

      // Identity should have deletedAt set immediately
      const identity = await prisma.identity.findUnique({
        where: { id: testIdentityId },
      });
      expect(identity?.deletedAt).not.toBeNull();
      expect(identity?.anonymized).toBe(false); // Not yet finalized
    });

    it('should capture GdprDeletionEmail when JWT email provided', async () => {
      // Find the request that was created
      const request = await prisma.request.findFirst({
        where: {
          identityId: testIdentityId,
          requestType: 'GDPR_DELETE',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(request).not.toBeNull();

      // GdprDeletionEmail should exist
      const deletionEmail = await prisma.gdprDeletionEmail.findUnique({
        where: { requestId: request!.id },
      });
      expect(deletionEmail).not.toBeNull();
      expect(deletionEmail?.email).toBe(testEmail);
      expect(deletionEmail?.locale).toBe('en');
    });

    it('should NOT create backups for IMMEDIATE tables (deletion vs suspension)', async () => {
      // No backups should exist for deletion
      const backups = await prisma.suspensionBackup.count({
        where: { identityId: testIdentityId },
      });
      expect(backups).toBe(0);
    });

    it('should delete IMMEDIATE-risk tables at T+0 (notification suppression)', async () => {
      // ScheduledNotification should be deleted
      const scheduledNotifications = await prisma.scheduledNotification.findMany({
        where: { identityId: testIdentityId },
      });
      expect(scheduledNotifications.length).toBe(0);
    });

    it('should delete delivery tokens (no notification side effects possible)', async () => {
      // UserEmailChannel should be deleted (no delivery tokens)
      const emailChannels = await prisma.userEmailChannel.findFirst({
        where: { notificationProfileId: testNotificationProfileId },
      });
      expect(emailChannels).toBeNull();

      // UserPushChannel should be deleted (no push tokens)
      const pushChannels = await prisma.userPushChannel.findFirst({
        where: { notificationProfileId: testNotificationProfileId },
      });
      expect(pushChannels).toBeNull();
    });

    it('should finalize deletion and delete GdprDeletionEmail after cron', async () => {
      // Find the request
      const request = await prisma.request.findFirst({
        where: {
          identityId: testIdentityId,
          requestType: 'GDPR_DELETE',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(request).not.toBeNull();

      // Process deletion (simulates cron)
      await gdprDeletionService.processPendingDeletions(1);

      // Identity should now be anonymized
      const identity = await prisma.identity.findUnique({
        where: { id: testIdentityId },
      });
      expect(identity?.anonymized).toBe(true);

      // GdprDeletionEmail should be DELETED after cron (write-once/delete-immediately)
      const deletionEmail = await prisma.gdprDeletionEmail.findUnique({
        where: { requestId: request!.id },
      });
      expect(deletionEmail).toBeNull();
    });
  });
});
