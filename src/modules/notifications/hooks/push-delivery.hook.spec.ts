/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { PushDeliveryHook } from './push-delivery.hook';
import { NotificationDeliveryService } from '../notification-delivery.service';
import { NotificationAuditService } from '../notification-audit.service';
import { NotificationDeliveryStatus, NotificationLog, UserPushChannel } from '@prisma/client';

const createMockPushChannel = (overrides: Partial<UserPushChannel> = {}): UserPushChannel => ({
  id: 'push-1',
  notificationProfileId: 'profile-1',
  expoToken: 'ExponentPushToken[123]',
  uniqueKey: 'unique-key',
  platform: 'android',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const createMockNotification = (overrides: Partial<NotificationLog> = {}): NotificationLog => ({
  id: 'notif-1',
  identityId: 'user-1',
  type: 'TEST_EVENT',
  payload: { title: 'Test' },
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  actorId: null,
  visibleAt: new Date(),
  readAt: null,
  anonymizedAt: null,
  ...overrides,
});

describe('PushDeliveryHook', () => {
  let hook: PushDeliveryHook;
  let deliveryService: jest.Mocked<NotificationDeliveryService>;
  let auditService: jest.Mocked<NotificationAuditService>;

  const mockNotification = createMockNotification({
    id: 'notif-1',
    identityId: 'user-1',
    type: 'TEST_EVENT',
    payload: { title: 'Test' },
  });

  beforeEach(async () => {
    const deliveryServiceMock = {
      resolveDeliveryEligibility: jest.fn(),
      getUserChannels: jest.fn(),
      sendPush: jest.fn(),
    };

    const auditServiceMock = {
      logDelivery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushDeliveryHook,
        {
          provide: NotificationDeliveryService,
          useValue: deliveryServiceMock,
        },
        {
          provide: NotificationAuditService,
          useValue: auditServiceMock,
        },
      ],
    }).compile();

    hook = module.get<PushDeliveryHook>(PushDeliveryHook);
    deliveryService = module.get(NotificationDeliveryService);
    auditService = module.get(NotificationAuditService);

    process.env.NOTIFICATIONS_PUSH_ENABLED = 'true';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should skip if circuit breaker is enabled (env var not true)', async () => {
    process.env.NOTIFICATIONS_PUSH_ENABLED = 'false';

    await hook.onNotificationCreated(mockNotification);

    expect(auditService.logDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: NotificationDeliveryStatus.SKIPPED,
        reason: 'Channel disabled by env',
      }),
    );
  });

  it('should skip if delivery is not allowed', async () => {
    deliveryService.resolveDeliveryEligibility.mockResolvedValue({
      allowed: false,
      reason: 'User suspended',
    });

    await hook.onNotificationCreated(mockNotification);

    expect(auditService.logDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: NotificationDeliveryStatus.SKIPPED,
        reason: 'User suspended',
      }),
    );
  });

  it('should skip if no channels configured', async () => {
    deliveryService.resolveDeliveryEligibility.mockResolvedValue({
      allowed: true,
      reason: 'OK',
    });
    deliveryService.getUserChannels.mockResolvedValue({
      emailChannels: [],
      pushChannels: [],
    });

    await hook.onNotificationCreated(mockNotification);

    expect(auditService.logDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: NotificationDeliveryStatus.SKIPPED,
        reason: 'No push channels configured',
      }),
    );
  });

  it('should attempt delivery and log SENT on success', async () => {
    deliveryService.resolveDeliveryEligibility.mockResolvedValue({
      allowed: true,
      reason: 'OK',
    });
    deliveryService.getUserChannels.mockResolvedValue({
      emailChannels: [],
      pushChannels: [
        createMockPushChannel({ id: '1', expoToken: 'ExponentPushToken[123]', isActive: true }),
      ],
    });
    deliveryService.sendPush.mockResolvedValue({
      status: 'SENT',
      target: 'ExponentPushToken[123]',
    });

    await hook.onNotificationCreated(mockNotification);

    expect(deliveryService.sendPush).toHaveBeenCalledWith(
      'ExponentPushToken[123]',
      mockNotification.payload,
    );
    expect(auditService.logDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: NotificationDeliveryStatus.SENT,
        target: 'ExponentPushToken[123]',
      }),
    );
  });

  it('should log FAILED on delivery failure', async () => {
    deliveryService.resolveDeliveryEligibility.mockResolvedValue({
      allowed: true,
      reason: 'OK',
    });
    deliveryService.getUserChannels.mockResolvedValue({
      emailChannels: [],
      pushChannels: [
        createMockPushChannel({ id: '1', expoToken: 'ExponentPushToken[fail]', isActive: true }),
      ],
    });
    deliveryService.sendPush.mockResolvedValue({
      status: 'FAILED',
      target: 'ExponentPushToken[fail]',
      error: 'DeviceNotRegistered',
    });

    await hook.onNotificationCreated(mockNotification);

    expect(auditService.logDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: NotificationDeliveryStatus.FAILED,
        reason: 'DeviceNotRegistered',
      }),
    );
  });
});
