/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import {
  WeeklySafetyModerationReportJob,
  WeeklySafetyModerationPayload,
} from './weekly-safety-moderation-report.job';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';
import { Logger } from '@nestjs/common';

describe('WeeklySafetyModerationReportJob', () => {
  let job: WeeklySafetyModerationReportJob;
  let prisma: PrismaService;
  let notificationsService: NotificationsService;
  let identityService: IdentityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklySafetyModerationReportJob,
        {
          provide: PrismaService,
          useValue: {
            report: {
              count: jest.fn(),
              groupBy: jest.fn(),
              findMany: jest.fn(),
            },
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

    job = module.get<WeeklySafetyModerationReportJob>(WeeklySafetyModerationReportJob);
    prisma = module.get<PrismaService>(PrismaService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
    identityService = module.get<IdentityService>(IdentityService);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  it('should calculate metrics and emit notification', async () => {
    // Setup mocks for report counts
    (prisma.report.count as jest.Mock)
      .mockResolvedValueOnce(100) // Current week reports
      .mockResolvedValueOnce(80) // Previous week reports
      .mockResolvedValueOnce(60) // Resolved this week
      .mockResolvedValueOnce(25) // Backlog total
      .mockResolvedValueOnce(10) // Backlog > 7 days
      .mockResolvedValueOnce(5) // Backlog > 14 days
      .mockResolvedValueOnce(2); // Backlog > 30 days

    // Setup mocks for report groupBy (contentType, category)
    (prisma.report.groupBy as jest.Mock)
      .mockResolvedValueOnce([
        { contentType: 'post', _count: { contentType: 50 } },
        { contentType: 'comment', _count: { contentType: 30 } },
      ])
      .mockResolvedValueOnce([
        { category: 'spam', _count: { category: 40 } },
        { category: 'harassment', _count: { category: 25 } },
      ])
      .mockResolvedValueOnce([
        // Outcome stats
        { valid: true, _count: { valid: 30 } },
        { valid: false, _count: { valid: 20 } },
        { valid: null, _count: { valid: 10 } },
      ]);

    // Setup mocks for resolved reports (for avg resolution time)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    (prisma.report.findMany as jest.Mock).mockResolvedValue([
      { createdAt: oneHourAgo, resolvedAt: now },
    ]);

    // Setup mocks for identity counts
    (prisma.identity.count as jest.Mock)
      .mockResolvedValueOnce(15) // Flagged
      .mockResolvedValueOnce(5) // Suspended
      .mockResolvedValueOnce(3); // Banned

    await job.run();

    // Verify notification was emitted
    expect(identityService.getOrCreateSystemIdentity).toHaveBeenCalled();
    expect(notificationsService.notifyByIdentityId).toHaveBeenCalledTimes(1);

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        type: string;
        identityId: string;
        payload: WeeklySafetyModerationPayload;
      };
    expect(callArgs.type).toBe('WEEKLY_SAFETY_MODERATION_REPORT');
    expect(callArgs.identityId).toBe('SYSTEM');

    const payload = callArgs.payload;

    // Report volume
    expect(payload.reportVolume.total).toBe(100);
    expect(payload.reportVolume.previousWeekTotal).toBe(80);
    expect(payload.reportVolume.trend).toBe('UP');
    expect(payload.reportVolume.byContentType).toHaveLength(2);
    expect(payload.reportVolume.byCategory).toHaveLength(2);

    // Throughput
    expect(payload.throughput.resolvedThisWeek).toBe(60);
    expect(payload.throughput.resolutionRate).toBe(60); // 60/100 * 100
    expect(payload.throughput.avgResolutionTimeHours).toBe(1); // 1 hour

    // Backlog
    expect(payload.backlog.total).toBe(25);
    expect(payload.backlog.olderThan7Days).toBe(10);
    expect(payload.backlog.olderThan14Days).toBe(5);
    expect(payload.backlog.olderThan30Days).toBe(2);

    // Outcomes
    expect(payload.outcomes.valid).toBe(30);
    expect(payload.outcomes.invalid).toBe(20);
    expect(payload.outcomes.pending).toBe(10);

    // Identity signals
    expect(payload.identitySignals.flagged).toBe(15);
    expect(payload.identitySignals.suspended).toBe(5);
    expect(payload.identitySignals.banned).toBe(3);
    expect(payload.identitySignals.totalFlaggedSuspendedBanned).toBe(23);
  });

  it('should handle zero totals correctly (avoid division by zero)', async () => {
    // All counts return 0
    (prisma.report.count as jest.Mock).mockResolvedValue(0);
    (prisma.report.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.identity.count as jest.Mock).mockResolvedValue(0);

    await job.run();

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        payload: WeeklySafetyModerationPayload;
      };
    const payload = callArgs.payload;

    expect(payload.throughput.resolutionRate).toBe(0);
    expect(payload.throughput.avgResolutionTimeHours).toBeNull();
    expect(payload.reportVolume.trend).toBe('FLAT');
    expect(payload.identitySignals.trend).toBe('FLAT');
  });

  it('should calculate DOWN trend when reports decrease', async () => {
    // Current = 50, Previous = 100 => DOWN
    (prisma.report.count as jest.Mock)
      .mockResolvedValueOnce(50) // Current week
      .mockResolvedValueOnce(100) // Previous week
      .mockResolvedValue(0); // All other counts

    (prisma.report.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.identity.count as jest.Mock).mockResolvedValue(0);

    await job.run();

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        payload: WeeklySafetyModerationPayload;
      };
    const payload = callArgs.payload;

    expect(payload.reportVolume.trend).toBe('DOWN');
  });

  it('should treat small changes as FLAT', async () => {
    // Current = 100, Previous = 99 => FLAT (within 5% threshold)
    (prisma.report.count as jest.Mock)
      .mockResolvedValueOnce(100) // Current
      .mockResolvedValueOnce(99) // Previous
      .mockResolvedValue(0);

    (prisma.report.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.identity.count as jest.Mock).mockResolvedValue(0);

    await job.run();

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        payload: WeeklySafetyModerationPayload;
      };
    const payload = callArgs.payload;

    expect(payload.reportVolume.trend).toBe('FLAT');
  });

  it('should handle null avgResolutionTime when no reports resolved', async () => {
    (prisma.report.count as jest.Mock)
      .mockResolvedValueOnce(10) // Current week
      .mockResolvedValueOnce(5) // Previous week
      .mockResolvedValueOnce(0) // Resolved this week = 0
      .mockResolvedValue(0);

    (prisma.report.groupBy as jest.Mock).mockResolvedValue([]);
    (prisma.report.findMany as jest.Mock).mockResolvedValue([]); // No resolved reports
    (prisma.identity.count as jest.Mock).mockResolvedValue(0);

    await job.run();

    const callArgs = // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((notificationsService.notifyByIdentityId as jest.Mock).mock.calls as any[][])[0][0] as {
        payload: WeeklySafetyModerationPayload;
      };
    const payload = callArgs.payload;

    expect(payload.throughput.avgResolutionTimeHours).toBeNull();
  });
});
