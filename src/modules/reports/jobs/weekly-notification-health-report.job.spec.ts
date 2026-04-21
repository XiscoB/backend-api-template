/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import {
  WeeklyNotificationHealthReportJob,
  WeeklyNotificationHealthPayload,
} from './weekly-notification-health-report.job';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';
import { Logger } from '@nestjs/common';

describe('WeeklyNotificationHealthReportJob', () => {
  let job: WeeklyNotificationHealthReportJob;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  let identityService: IdentityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyNotificationHealthReportJob,
        {
          provide: PrismaService,
          useValue: {
            notificationLog: {
              count: jest.fn(),
              groupBy: jest.fn(),
            },
            notificationDeliveryLog: {
              groupBy: jest.fn(),
            },
            userEmailChannel: {
              groupBy: jest.fn(),
            },
            userNotificationProfile: {
              count: jest.fn(),
            },
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyByIdentityId: jest.fn(),
          },
        },
        {
          provide: IdentityService,
          useValue: {
            getOrCreateSystemIdentity: jest.fn().mockResolvedValue({ id: 'SYSTEM' }),
          },
        },
        Logger,
      ],
    }).compile();

    job = module.get<WeeklyNotificationHealthReportJob>(WeeklyNotificationHealthReportJob);
    prisma = module.get<PrismaService>(PrismaService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
    identityService = module.get<IdentityService>(IdentityService);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  it('should calculate metrics and emit notification', async () => {
    // Setup mocks
    (prisma.notificationLog.count as jest.Mock)
      .mockResolvedValueOnce(100) // Current week total
      .mockResolvedValueOnce(80); // Previous week total

    (prisma.notificationLog.groupBy as jest.Mock).mockResolvedValue([
      { type: 'GDPR_EXPORT_READY', _count: { type: 50 } },
      { type: 'WELCOME', _count: { type: 30 } },
    ]);

    (prisma.notificationDeliveryLog.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        // Current week delivery stats
        { status: 'SENT', _count: { status: 80 } },
        { status: 'FAILED', _count: { status: 10 } },
        { status: 'SKIPPED', _count: { status: 10 } },
      ])
      .mockResolvedValueOnce([
        // Previous week delivery stats
        { status: 'SENT', _count: { status: 70 } },
        { status: 'FAILED', _count: { status: 5 } },
        { status: 'SKIPPED', _count: { status: 5 } },
      ])
      .mockResolvedValueOnce([
        // Channel stats
        { channelType: 'EMAIL', _count: { channelType: 70 } },
        { channelType: 'PUSH', _count: { channelType: 20 } },
        { channelType: 'NONE', _count: { channelType: 10 } },
      ])
      .mockResolvedValueOnce([
        // Top failing event types
        { eventType: 'GDPR_EXPORT_READY', _count: { eventType: 5 } },
      ])
      .mockResolvedValueOnce([
        // Top failure reasons
        { reason: 'SMTP timeout', _count: { reason: 5 } },
      ]);

    (prisma.userEmailChannel.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        // Users with email channel
        { notificationProfileId: 'profile-1' },
        { notificationProfileId: 'profile-2' },
        { notificationProfileId: 'profile-3' },
      ])
      .mockResolvedValueOnce([
        // Users with active channel
        { notificationProfileId: 'profile-1' },
        { notificationProfileId: 'profile-2' },
      ]);

    (prisma.userNotificationProfile.count as jest.Mock).mockResolvedValue(1); // Enabled but no active

    await job.run();

    // Verify notification was emitted
    expect(identityService.getOrCreateSystemIdentity).toHaveBeenCalled();
    expect(notificationsService.notifyByIdentityId).toHaveBeenCalledTimes(1);

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        type: string;
        identityId: string;
        payload: WeeklyNotificationHealthPayload;
      };
    expect(callArgs.type).toBe('WEEKLY_NOTIFICATION_HEALTH_REPORT');
    expect(callArgs.identityId).toBe('SYSTEM');

    const payload = callArgs.payload;

    // Volume
    expect(payload.volume.total).toBe(100);
    expect(payload.volume.previousWeekTotal).toBe(80);
    expect(payload.volume.trend).toBe('UP');

    // Delivery
    expect(payload.delivery.sent).toBe(80);
    expect(payload.delivery.failed).toBe(10);
    expect(payload.delivery.skipped).toBe(10);
    expect(payload.delivery.failureRate).toBe(10); // 10/100 * 100

    // Channels
    expect(payload.channels.email.count).toBe(70);
    expect(payload.channels.push.count).toBe(20);
    expect(payload.channels.none.count).toBe(10);

    // Config health
    expect(payload.configHealth.usersWithEmailChannel).toBe(3);
    expect(payload.configHealth.usersWithAllChannelsDisabled).toBe(1); // 3 - 2
  });

  it('should handle zero totals correctly (avoid division by zero)', async () => {
    // All counts return 0
    (prisma.notificationLog.count as jest.Mock).mockResolvedValue(0);
    (prisma.notificationLog.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.notificationDeliveryLog.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.userEmailChannel.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.userNotificationProfile.count as jest.Mock).mockResolvedValue(0);

    await job.run();

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        payload: WeeklyNotificationHealthPayload;
      };
    const payload = callArgs.payload;

    expect(payload.delivery.failureRate).toBe(0);
    expect(payload.channels.email.percent).toBe(0);
    expect(payload.volume.trend).toBe('FLAT');
  });

  it('should calculate trend correctly', async () => {
    // Current = 50, Previous = 100 => DOWN
    (prisma.notificationLog.count as jest.Mock)
      .mockResolvedValueOnce(50) // Current
      .mockResolvedValueOnce(100); // Previous

    (prisma.notificationLog.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.notificationDeliveryLog.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.userEmailChannel.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.userNotificationProfile.count as jest.Mock).mockResolvedValue(0);

    await job.run();

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        payload: WeeklyNotificationHealthPayload;
      };
    const payload = callArgs.payload;

    expect(payload.volume.trend).toBe('DOWN');
  });

  it('should treat small changes as FLAT', async () => {
    // Current = 100, Previous = 99 => FLAT (within 5% threshold)
    (prisma.notificationLog.count as jest.Mock)
      .mockResolvedValueOnce(100) // Current
      .mockResolvedValueOnce(99); // Previous

    (prisma.notificationLog.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.notificationDeliveryLog.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.userEmailChannel.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.userNotificationProfile.count as jest.Mock).mockResolvedValue(0);

    await job.run();

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        payload: WeeklyNotificationHealthPayload;
      };
    const payload = callArgs.payload;

    expect(payload.volume.trend).toBe('FLAT');
  });
});
