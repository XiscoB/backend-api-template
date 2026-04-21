/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PUSH DELIVERY INTEGRATION TESTS
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURPOSE:
 * Verify the strict "Infrastructure-only" behavior of the Push Adapter.
 *
 * STRATEGY:
 * - Real Database (Prisma)
 * - Real NotificationsModule (Cron, Audit, Service)
 * - Real ExpoPushAdapter (Unit under test)
 * - Mocked "Network" (global.fetch)
 * - Simulated Product Hook (TestPushHook) to trigger delivery
 *
 * SCENARIOS:
 * 1. ENABLED: Adapter sends HTTP request, Logs SENT.
 * 2. DISABLED: Adapter skips HTTP request, Logs SKIPPED.
 * 3. FAILED: Adapter catches error, Logs FAILED.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationsCronService } from './notifications-cron.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { ExpoPushAdapter } from './adapters/expo-push.adapter';
import { PUSH_ADAPTER } from './adapters/adapter.types';
import { NOTIFICATION_DELIVERY_HOOKS, NotificationDeliveryHook } from './notifications.types';
import { NotificationsModule } from './notifications.module';
import { INestApplication, Injectable } from '@nestjs/common';
import { NotificationLog } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';

// ─────────────────────────────────────────────────────────────────────
// 1. Simulated Product Hook
// ─────────────────────────────────────────────────────────────────────
// Mimics a product-side hook that resolves tokens from its own storage
// and calls the Delivery Service.
@Injectable()
class TestPushHook implements NotificationDeliveryHook {
  constructor(private readonly deliveryService: NotificationDeliveryService) {}

  async onNotificationCreated(log: NotificationLog): Promise<void> {
    if (log.type === 'PUSH_TEST_EVENT') {
      // Simulate finding a token for this user
      const fakeToken = 'ExponentPushToken[test-token]';

      await this.deliveryService.sendPush(
        fakeToken,
        {
          title: 'Test Title',
          body: 'Test Body',
          data: { foo: 'bar' },
        },
        {
          identityId: log.identityId,
          eventType: log.type,
        },
      );
    }
  }
}

describe('Push Delivery Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notifsService: NotificationsService;
  let cronService: NotificationsCronService;

  // Spies
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    // Override global fetch
    fetchSpy = jest.spyOn(global, 'fetch');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [NotificationsModule],
    })
      .overrideProvider(PUSH_ADAPTER)
      .useClass(ExpoPushAdapter) // Use REAL adapter logic
      .overrideProvider(NOTIFICATION_DELIVERY_HOOKS)
      .useFactory({
        factory: (deliveryService: NotificationDeliveryService) => {
          return [new TestPushHook(deliveryService)];
        },
        inject: [NotificationDeliveryService],
      })
      .overrideProvider(AppConfigService)
      .useValue({
        get notificationsPushEnabled() {
          return process.env.NOTIFICATIONS_PUSH_ENABLED === 'true';
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    notifsService = moduleFixture.get(NotificationsService);
    cronService = moduleFixture.get(NotificationsCronService);
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    // Cleanup - Order matters due to FK constraints
    await prisma.notificationDeliveryLog.deleteMany();
    await prisma.notificationLog.deleteMany();
    await prisma.scheduledNotification.deleteMany();
    await prisma.userEmailChannel.deleteMany();
    await prisma.userNotificationProfile.deleteMany();
    await prisma.identity.deleteMany();

    // Clear Spies
    fetchSpy.mockClear();

    // Default Env
    process.env.NOTIFICATIONS_PUSH_ENABLED = 'true';
  });

  async function createTestIdentity() {
    const id = `user-${Date.now()}`;
    // Use repository create if available, or prisma
    // Assuming repo has create or we use prisma directly just to be safe and avoid type issues with repo signature
    return await prisma.identity.upsert({
      where: { externalUserId: id },
      create: { externalUserId: id, anonymized: false },
      update: {},
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // TEST SCENARIOS
  // ─────────────────────────────────────────────────────────────────────

  it('ENABLED: Invokes Adapter via HTTP and logs SENT', async () => {
    // Arrange
    const identity = await createTestIdentity();

    // Create Profile with Email Channel to pass AuditService checks
    // Note: emailChannels is a list relation
    await prisma.userNotificationProfile.upsert({
      where: { identityId: identity.id },
      create: {
        identityId: identity.id,
        notificationsEnabled: true,
        emailChannels: {
          create: [{ email: 'fake@example.com', enabled: true, unsubscribeToken: 'token-1' }],
        },
      },
      update: {
        // Add a channel if it doesn't exist, strictly for the test to pass "hasEnabledEmail" check
        emailChannels: {
          create: [{ email: 'fake@example.com', enabled: true, unsubscribeToken: 'token-1' }],
        },
      },
    });

    // Mock successful Expo response
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ status: 'ok' }] }),
    } as Response);

    // Act: Create Scheduled -> Run Cron
    await notifsService.createScheduled({
      identityId: identity.id,
      type: 'PUSH_TEST_EVENT',
      payload: { foo: 'bar' },
      scheduledAt: new Date(Date.now() - 10000), // Past
    });

    await cronService.processPendingNotifications();

    // Assert
    // 1. Adapter called (fetch)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(fetchSpy.mock.calls[0][0]).toContain('exp.host'); // URL check

    // 2. Logs SENT
    const logs = await prisma.notificationDeliveryLog.findMany({
      where: { identityId: identity.id, channelType: 'PUSH' },
    });
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe('SENT');
  });

  it('DISABLED: Skips HTTP request and logs SKIPPED', async () => {
    process.env.NOTIFICATIONS_PUSH_ENABLED = 'false';

    const identity = await createTestIdentity();
    await prisma.userNotificationProfile.upsert({
      where: { identityId: identity.id },
      create: {
        identityId: identity.id,
        notificationsEnabled: true,
        emailChannels: {
          create: [{ email: 'fake@example.com', enabled: true, unsubscribeToken: 'token-2' }],
        },
      },
      update: {},
    });

    // Act
    await notifsService.createScheduled({
      identityId: identity.id,
      type: 'PUSH_TEST_EVENT',
      payload: { foo: 'bar' },
      scheduledAt: new Date(Date.now() - 10000),
    });

    await cronService.processPendingNotifications();

    // Assert
    // 1. Adapter NOT called (fetch)
    expect(fetchSpy).not.toHaveBeenCalled();

    // 2. Logs SKIPPED
    const logs = await prisma.notificationDeliveryLog.findMany({
      where: { identityId: identity.id, channelType: 'PUSH' },
    });
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe('SKIPPED');
    expect(logs[0].reason).toMatch(/disabled by env/);
  });

  it('FAILED: Handles network error gracefully', async () => {
    const identity = await createTestIdentity();
    await prisma.userNotificationProfile.upsert({
      where: { identityId: identity.id },
      create: {
        identityId: identity.id,
        notificationsEnabled: true,
        emailChannels: {
          create: [{ email: 'fake@example.com', enabled: true, unsubscribeToken: 'token-3' }],
        },
      },
      update: {},
    });

    // Mock Network Error
    fetchSpy.mockRejectedValue(new Error('Expo Down'));

    // Act
    await notifsService.createScheduled({
      identityId: identity.id,
      type: 'PUSH_TEST_EVENT',
      payload: {},
      scheduledAt: new Date(Date.now() - 10000),
    });

    await cronService.processPendingNotifications();

    // Assert
    expect(fetchSpy).toHaveBeenCalled();

    // Logs FAILED
    const logs = await prisma.notificationDeliveryLog.findMany({
      where: { identityId: identity.id, channelType: 'PUSH' },
    });
    expect(logs.length).toBe(1);
    expect(logs[0].status).toBe('FAILED');
    expect(logs[0].reason).toContain('Expo Down');
  });

  it('NO_CHANNELS: Skips Log creation entirely', async () => {
    const identity = await createTestIdentity();
    await prisma.userNotificationProfile.upsert({
      where: { identityId: identity.id },
      create: {
        identityId: identity.id,
        notificationsEnabled: true,
        emailChannels: {
          create: [{ email: 'fake@example.com', enabled: false, unsubscribeToken: 'token-4' }],
        },
      },
      update: {},
    });

    // Act
    await notifsService.createScheduled({
      identityId: identity.id,
      type: 'PUSH_TEST_EVENT',
      payload: { foo: 'bar' },
      scheduledAt: new Date(Date.now() - 10000),
    });

    await cronService.processPendingNotifications();

    // Assert
    // 1. Adapter NOT called
    expect(fetchSpy).not.toHaveBeenCalled();

    // 2. No NotificationLog
    const logs = await prisma.notificationLog.findMany({
      where: { identityId: identity.id },
    });
    expect(logs.length).toBe(0);

    // 3. No DeliveryLog
    const deliveryLogs = await prisma.notificationDeliveryLog.findMany({
      where: { identityId: identity.id },
    });
    expect(deliveryLogs.length).toBe(0);
  });
});
