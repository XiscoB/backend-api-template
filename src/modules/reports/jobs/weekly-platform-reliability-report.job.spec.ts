/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { WeeklyPlatformReliabilityReportJob } from './weekly-platform-reliability-report.job';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';
import { SchedulerLock } from '@prisma/client';

describe('WeeklyPlatformReliabilityReportJob', () => {
  let job: WeeklyPlatformReliabilityReportJob;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  let identityService: IdentityService;

  const mockSystemIdentity = { id: 'system-identity-id' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyPlatformReliabilityReportJob,
        {
          provide: PrismaService,
          useValue: {
            schedulerLock: {
              findMany: jest.fn(),
            },
            internalLog: {
              count: jest.fn(),
              groupBy: jest.fn(),
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
            getOrCreateSystemIdentity: jest.fn().mockResolvedValue(mockSystemIdentity),
          },
        },
      ],
    }).compile();

    job = module.get<WeeklyPlatformReliabilityReportJob>(WeeklyPlatformReliabilityReportJob);
    prisma = module.get<PrismaService>(PrismaService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
    identityService = module.get<IdentityService>(IdentityService);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  it('should generate report and emit notification', async () => {
    // Mock Date to ensure deterministic stale check
    const now = new Date('2026-01-31T10:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Mock Scheduler Locks
    const mockLocks: SchedulerLock[] = [
      {
        jobName: 'healthy-job',
        lockedBy: 'instance-1',
        lockedAt: new Date(now.getTime() - 1000), // Held 1s ago
        expiresAt: new Date(now.getTime() + 5000), // Expires in future (Active)
        lastRunAt: new Date(now.getTime() - 60000), // Ran 1 min ago
      },
      {
        jobName: 'stale-or-idle-job',
        lockedBy: 'instance-2',
        lockedAt: new Date(now.getTime() - 1000000),
        expiresAt: new Date(now.getTime() - 1000), // Expired (Stale/Idle)
        lastRunAt: new Date(now.getTime() - 86400000), // Ran 1 day ago
      },
      {
        jobName: 'never-run-job',
        lockedBy: 'instance-3',
        lockedAt: new Date(now.getTime() - 1000),
        expiresAt: new Date(now.getTime() + 5000),
        lastRunAt: null, // Never run
      },
    ];

    (prisma.schedulerLock.findMany as jest.Mock).mockResolvedValue(mockLocks);

    // Mock Internal Logs
    (prisma.internalLog.count as jest.Mock)
      .mockResolvedValueOnce(100) // Total
      .mockResolvedValueOnce(5) // Error
      .mockResolvedValueOnce(10) // Warn
      .mockResolvedValueOnce(4); // Previous Week Errors (for trend UP)

    (prisma.internalLog.groupBy as jest.Mock).mockResolvedValue([
      { source: 'PaymentService', _count: { id: 3 } },
      { source: 'AuthService', _count: { id: 2 } },
    ]);

    await job.run();

    // Verify Queries
    expect(prisma.schedulerLock.findMany).toHaveBeenCalled();
    expect(prisma.internalLog.count).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.objectContaining({ createdAt: { gte: sevenDaysAgo } }),
      }),
    );
    expect(prisma.internalLog.groupBy).toHaveBeenCalled();

    // Verify Notification
    expect(identityService.getOrCreateSystemIdentity).toHaveBeenCalled();
    expect(notificationsService.notifyByIdentityId).toHaveBeenCalledWith({
      identityId: mockSystemIdentity.id,
      actorIdentityId: undefined,
      type: 'WEEKLY_PLATFORM_RELIABILITY_REPORT',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      payload: expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        scheduler: expect.objectContaining({
          totalJobs: 3,
          jobsRunAtLeastOnce: 2,
          jobsNeverRun: 1,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          lockIntegrity: expect.objectContaining({
            staleLocksCount: 1, // Only the stale/idle one
          }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        backgroundErrors: expect.objectContaining({
          totalLogs: 100,
          errorCount: 5,
          trend: 'UP', // 5 > 4 * 1.1 (4.4) -> UP
        }),
      }),
    });
  });

  it('should calculate longest lock hold correctly', async () => {
    const now = new Date('2026-01-31T10:00:00Z');
    jest.useFakeTimers().setSystemTime(now);

    const mockLocks: SchedulerLock[] = [
      {
        jobName: 'long-job',
        lockedBy: 'instance-1',
        lockedAt: new Date(now.getTime() - 50000), // Held 50s
        expiresAt: new Date(now.getTime() + 10000), // Active
        lastRunAt: new Date(),
      },
      {
        jobName: 'short-job',
        lockedBy: 'instance-1',
        lockedAt: new Date(now.getTime() - 1000), // Held 1s
        expiresAt: new Date(now.getTime() + 10000), // Active
        lastRunAt: new Date(),
      },
    ];

    (prisma.schedulerLock.findMany as jest.Mock).mockResolvedValue(mockLocks);
    // return defaults for logs
    (prisma.internalLog.count as jest.Mock).mockResolvedValue(0);
    (prisma.internalLog.groupBy as jest.Mock).mockResolvedValue([]);

    await job.run();

    expect(notificationsService.notifyByIdentityId).toHaveBeenCalledWith(
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        payload: expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          scheduler: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            lockIntegrity: expect.objectContaining({
              longestLockHoldMs: 50000,
            }),
          }),
        }),
      }),
    );
  });
});
