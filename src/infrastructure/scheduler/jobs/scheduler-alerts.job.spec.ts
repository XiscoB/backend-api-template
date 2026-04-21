import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerAlertsJob } from './scheduler-alerts.job';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AlertDeliveryService } from '../../delivery';

function asProvider<T>(value: unknown): T {
  return value as T;
}

/** Mock interface for PrismaService methods used in tests */
interface MockPrismaService {
  schedulerLock: {
    findMany: jest.Mock;
  };
  internalLog: {
    groupBy: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
  };
}

/** Mock interface for AlertDeliveryService methods used in tests */
interface MockAlertDeliveryService {
  sendAlert: jest.Mock;
}

describe('SchedulerAlertsJob', () => {
  let job: SchedulerAlertsJob;
  let mockPrisma: MockPrismaService;
  let mockAlertDeliveryService: MockAlertDeliveryService;

  beforeEach(async () => {
    mockPrisma = {
      schedulerLock: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      internalLog: {
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    mockAlertDeliveryService = {
      sendAlert: jest.fn().mockResolvedValue({ sent: true, recipientCount: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerAlertsJob,
        { provide: PrismaService, useValue: asProvider<PrismaService>(mockPrisma) },
        {
          provide: AlertDeliveryService,
          useValue: asProvider<AlertDeliveryService>(mockAlertDeliveryService),
        },
      ],
    }).compile();

    job = module.get<SchedulerAlertsJob>(SchedulerAlertsJob);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  describe('checkMissedSchedules', () => {
    it('should alert when a job is delayed beyond threshold', async () => {
      const now = new Date();
      const lastRun = new Date(now.getTime() - 60 * 60 * 1000); // 60 mins ago

      mockPrisma.schedulerLock.findMany.mockResolvedValue([
        {
          jobName: 'every-minute',
          lastRunAt: lastRun,
        },
      ]);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'CRITICAL',
          title: expect.stringContaining('Job Not Running') as string,
        }),
      );

      expect(mockPrisma.internalLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            level: 'WARN',
            source: 'SchedulerAlertsJob',
            message: 'Scheduler Alert Sent',
          }) as object,
        }),
      );
    });

    it('should NOT alert when a job is within threshold', async () => {
      const now = new Date();
      const lastRun = new Date(now.getTime() - 2 * 60 * 1000);

      mockPrisma.schedulerLock.findMany.mockResolvedValue([
        {
          jobName: 'every-minute',
          lastRunAt: lastRun,
        },
      ]);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).not.toHaveBeenCalled();
    });

    it('should NOT alert for "never run" jobs (lastRunAt is null)', async () => {
      mockPrisma.schedulerLock.findMany.mockResolvedValue([
        {
          jobName: 'every-minute',
          lastRunAt: null,
        },
      ]);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).not.toHaveBeenCalled();
    });
  });

  describe('checkLockAnomalies', () => {
    it('should alert for STUCK RUNNING locks', async () => {
      const now = new Date();
      const lockedAt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

      mockPrisma.schedulerLock.findMany.mockResolvedValue([
        {
          jobName: 'stuck-job',
          lockedBy: 'worker-1',
          lockedAt: lockedAt, // 3h ago
          expiresAt: expiresAt, // Future
        },
      ]);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'WARNING',
          title: expect.stringContaining('Stuck Running Job') as string,
        }),
      );
    });

    it('should alert for ORPHANED locks (expired long ago)', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 3 * 60 * 60 * 1000);

      mockPrisma.schedulerLock.findMany.mockResolvedValue([
        {
          jobName: 'orphaned-job',
          lockedBy: 'worker-dead',
          lockedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
          expiresAt: expiresAt, // 3h ago
        },
      ]);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'INFO',
          title: expect.stringContaining('Orphaned Scheduler Lock') as string,
        }),
      );
    });

    it('should NOT alert for recently expired locks (normal idle)', async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() - 1 * 60 * 1000);

      mockPrisma.schedulerLock.findMany.mockResolvedValue([
        {
          jobName: 'finished-job',
          lockedBy: 'worker-1',
          lockedAt: new Date(now.getTime() - 5 * 60 * 1000),
          expiresAt: expiresAt,
        },
      ]);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).not.toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    it('should skip sending alert if a recent alert exists', async () => {
      const now = new Date();
      const lastRun = new Date(now.getTime() - 60 * 60 * 1000);

      mockPrisma.schedulerLock.findMany.mockResolvedValue([
        {
          jobName: 'every-minute',
          lastRunAt: lastRun,
        },
      ]);

      // Rate limit hit
      mockPrisma.internalLog.findFirst.mockResolvedValue({
        id: 'log-123',
        createdAt: new Date(now.getTime() - 5 * 60 * 1000),
      });

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).not.toHaveBeenCalled();
      expect(mockPrisma.internalLog.create).not.toHaveBeenCalled();
    });

    it('should send alert if no recent alert exists', async () => {
      const now = new Date();
      const lastRun = new Date(now.getTime() - 60 * 60 * 1000);

      mockPrisma.schedulerLock.findMany.mockResolvedValue([
        {
          jobName: 'every-minute',
          lastRunAt: lastRun,
        },
      ]);

      mockPrisma.internalLog.findFirst.mockResolvedValue(null);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).toHaveBeenCalled();
    });
  });
});
