/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { WeeklyGrowthReportJob, WeeklyGrowthPayload } from './weekly-growth-report.job';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';
import { Logger } from '@nestjs/common';

describe('WeeklyGrowthReportJob', () => {
  let job: WeeklyGrowthReportJob;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  let identityService: IdentityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyGrowthReportJob,
        {
          provide: PrismaService,
          useValue: {
            identity: {
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

    job = module.get<WeeklyGrowthReportJob>(WeeklyGrowthReportJob);
    prisma = module.get<PrismaService>(PrismaService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
    identityService = module.get<IdentityService>(IdentityService);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  it('should calculate metrics and emit notification', async () => {
    // Mock Prisma responses
    const countMock = prisma.identity.count as jest.Mock;

    // Order of calls:
    // 1. New Users
    // 2. Total
    // 3. WAU
    // 4. MAU
    // 5. D30
    // 6. D60
    // 7. D90

    countMock
      .mockResolvedValueOnce(10) // New
      .mockResolvedValueOnce(1000) // Total
      .mockResolvedValueOnce(500) // WAU
      .mockResolvedValueOnce(800) // MAU
      .mockResolvedValueOnce(100) // D30
      .mockResolvedValueOnce(50) // D60
      .mockResolvedValueOnce(20); // D90

    await job.run();

    // Verify Queries
    expect(countMock).toHaveBeenCalledTimes(7);

    // Verify Notification
    expect(identityService.getOrCreateSystemIdentity).toHaveBeenCalled();
    expect(notificationsService.notifyByIdentityId).toHaveBeenCalledTimes(1);

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        type: string;
        identityId: string;
        actorIdentityId: string;
        payload: WeeklyGrowthPayload;
      };
    expect(callArgs.type).toBe('WEEKLY_GROWTH_REPORT');
    expect(callArgs.identityId).toBe('SYSTEM');
    expect(callArgs.actorIdentityId).toBe('SYSTEM');

    const payload = callArgs.payload;
    expect(payload.metrics.newUsers).toBe(10);
    expect(payload.metrics.totalIdentities).toBe(1000);
    expect(payload.metrics.activeUsers.wau).toBe(500);
    expect(payload.metrics.activeUsers.mau).toBe(800);
    expect(payload.metrics.activeUsers.wauMauRatio).toBe(62.5); // 500/800 * 100
    expect(payload.metrics.dormancy.d30).toBe(100);
  });

  it('should handle zero MAU correctly (avoid division by zero)', async () => {
    const countMock = prisma.identity.count as jest.Mock;
    countMock.mockResolvedValue(0); // All counts 0

    await job.run();

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        payload: WeeklyGrowthPayload;
      };
    const payload = callArgs.payload;

    expect(payload.metrics.activeUsers.mau).toBe(0);
    expect(payload.metrics.activeUsers.wauMauRatio).toBe(0);
  });
});
