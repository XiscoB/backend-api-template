/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { EmailDeliveryHook } from './email-delivery.hook';
import { NotificationDeliveryService } from '../notification-delivery.service';
import { NotificationProfileService } from '../notification-profile.service';
import { NotificationCategory } from '../domain';
import { NotificationLog, UserEmailChannel, UserNotificationProfile } from '@prisma/client';

const createMockEmailChannel = (overrides: Partial<UserEmailChannel> = {}): UserEmailChannel => ({
  id: 'channel-1',
  notificationProfileId: 'profile-1',
  email: 'test@example.com',
  enabled: true,
  promoEnabled: true,
  unsubscribeToken: 'token-123',
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

describe('EmailDeliveryHook', () => {
  let hook: EmailDeliveryHook;
  let deliveryService: {
    sendEmail: jest.Mock;
  };
  let profileService: {
    getProfileWithChannels: jest.Mock;
  };

  const mockNotification = createMockNotification({
    id: 'notif-1',
    identityId: 'user-1',
    type: 'TEST_EVENT',
    payload: { title: 'Test' },
  });

  beforeEach(async () => {
    const deliveryServiceMock = {
      sendEmail: jest.fn(),
    };

    const profileServiceMock = {
      getProfileWithChannels: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailDeliveryHook,
        {
          provide: NotificationDeliveryService,
          useValue: deliveryServiceMock,
        },
        {
          provide: NotificationProfileService,
          useValue: profileServiceMock,
        },
      ],
    }).compile();

    hook = module.get<EmailDeliveryHook>(EmailDeliveryHook);
    deliveryService = module.get(NotificationDeliveryService);
    profileService = module.get(NotificationProfileService);

    process.env.NOTIFICATIONS_EMAIL_ENABLED = 'true';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should skip if circuit breaker is enabled (env var not true)', async () => {
    process.env.NOTIFICATIONS_EMAIL_ENABLED = 'false';

    await hook.onNotificationCreated(mockNotification);

    expect(profileService.getProfileWithChannels).not.toHaveBeenCalled();
    expect(deliveryService.sendEmail).not.toHaveBeenCalled();
  });

  it('should skip if profile is not found', async () => {
    profileService.getProfileWithChannels.mockResolvedValue(null);

    await hook.onNotificationCreated(mockNotification);

    expect(deliveryService.sendEmail).not.toHaveBeenCalled();
  });

  it('should skip if all channels are disabled', async () => {
    profileService.getProfileWithChannels.mockResolvedValue({
      id: 'profile-1',
      identityId: 'user-1',
      notificationsEnabled: true,
      language: 'en',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailChannels: [createMockEmailChannel({ enabled: false })],
    });

    await hook.onNotificationCreated(mockNotification);

    expect(deliveryService.sendEmail).not.toHaveBeenCalled();
  });

  it('should attempt delivery for enabled channels', async () => {
    const profile: UserNotificationProfile & { emailChannels: UserEmailChannel[] } = {
      id: 'profile-1',
      identityId: 'user-1',
      notificationsEnabled: true,
      language: 'en',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailChannels: [
        createMockEmailChannel({
          id: 'channel-1',
          email: 'test@example.com',
          enabled: true,
          promoEnabled: true,
        }),
      ],
    };

    profileService.getProfileWithChannels.mockResolvedValue(profile);

    await hook.onNotificationCreated(mockNotification);

    expect(deliveryService.sendEmail).toHaveBeenCalledWith(
      'test@example.com',
      mockNotification.payload,
      NotificationCategory.SYSTEM,
      {
        identityId: 'user-1',
        notificationProfileId: 'profile-1',
        eventType: 'TEST_EVENT',
      },
    );
  });

  it('should continue to next channel when one delivery fails', async () => {
    const profile: UserNotificationProfile & { emailChannels: UserEmailChannel[] } = {
      id: 'profile-1',
      identityId: 'user-1',
      notificationsEnabled: true,
      language: 'en',
      createdAt: new Date(),
      updatedAt: new Date(),
      emailChannels: [
        createMockEmailChannel({
          id: 'channel-1',
          email: 'fail@example.com',
          enabled: true,
        }),
        createMockEmailChannel({
          id: 'channel-2',
          email: 'ok@example.com',
          enabled: true,
        }),
      ],
    };

    profileService.getProfileWithChannels.mockResolvedValue(profile);

    deliveryService.sendEmail.mockRejectedValueOnce(new Error('SMTP Error'));
    deliveryService.sendEmail.mockResolvedValueOnce({
      target: 'ok@example.com',
      status: 'SENT',
    });

    await hook.onNotificationCreated(mockNotification);

    expect(deliveryService.sendEmail).toHaveBeenCalledTimes(2);
  });
});
