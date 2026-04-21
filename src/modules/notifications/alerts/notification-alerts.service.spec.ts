/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationAlertsService } from './notification-alerts.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationAlert } from './alerts.types';

describe('NotificationAlertsService', () => {
  let service: NotificationAlertsService;

  const mockPrisma = {
    notificationDeliveryLog: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationAlertsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<NotificationAlertsService>(NotificationAlertsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('runChecks', () => {
    it('should run all checks and return alerts', async () => {
      // Mock failure ratio check (no issues)
      mockPrisma.notificationDeliveryLog.groupBy.mockResolvedValue([
        { eventType: 'TEST', status: 'SENT', _count: { _all: 100 } },
        { eventType: 'TEST', status: 'FAILED', _count: { _all: 1 } },
      ]);

      // Mock silent skip check (no issues)
      mockPrisma.notificationDeliveryLog.findMany.mockResolvedValue([]);

      // Mock anomaly check (no issues)
      mockPrisma.notificationDeliveryLog.count.mockResolvedValue(10); // Prev and curr same

      const result = await service.runChecks();

      expect(result.alerts).toHaveLength(0);
      expect(result.checkedCount).toBe(3);
    });
  });

  describe('detectHighFailureRatio', () => {
    it('should alert on high failure ratio', async () => {
      mockPrisma.notificationDeliveryLog.groupBy.mockResolvedValue([
        { eventType: 'BAD_EVENT', status: 'FAILED', _count: { _all: 60 } },
        { eventType: 'BAD_EVENT', status: 'SENT', _count: { _all: 40 } }, // Total 100, 60 failed = 60%
      ]);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const result = (await (service as any).detectHighFailureRatio(
        new Date(),
      )) as NotificationAlert[];

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('HIGH_FAILURE_RATIO');
      expect(result[0].metadata.ratio).toBe(0.6);
    });

    it('should ignore low volume', async () => {
      mockPrisma.notificationDeliveryLog.groupBy.mockResolvedValue([
        { eventType: 'LOW_VOL', status: 'FAILED', _count: { _all: 10 } },
        { eventType: 'LOW_VOL', status: 'SENT', _count: { _all: 5 } }, // Total 15, < 50
      ]);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const result = (await (service as any).detectHighFailureRatio(
        new Date(),
      )) as NotificationAlert[];

      expect(result).toHaveLength(0);
    });
  });

  describe('detectSilentSkips', () => {
    it('should alert if user has enabled email but resolved to NONE', async () => {
      mockPrisma.notificationDeliveryLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          eventType: 'TEST',
          channelType: 'NONE',
          notificationProfile: {
            identityId: 'user-1',
            notificationsEnabled: true,
            emailChannels: [{ enabled: true, email: 'test@example.com' }],
          },
        },
      ]);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const result = (await (service as any).detectSilentSkips(new Date())) as NotificationAlert[];

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('SILENT_DELIVERY_SKIP');
      expect(result[0].severity).toBe('CRITICAL');
    });

    it('should NOT alert if user has notifications disabled', async () => {
      mockPrisma.notificationDeliveryLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          eventType: 'TEST',
          channelType: 'NONE',
          notificationProfile: {
            identityId: 'user-1',
            notificationsEnabled: false, // Disabled globally
            emailChannels: [{ enabled: true, email: 'test@example.com' }],
          },
        },
      ]);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const result = (await (service as any).detectSilentSkips(new Date())) as NotificationAlert[];

      expect(result).toHaveLength(0);
    });

    it('should NOT alert if user has no enabled channels', async () => {
      mockPrisma.notificationDeliveryLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          eventType: 'TEST',
          channelType: 'NONE',
          notificationProfile: {
            identityId: 'user-1',
            notificationsEnabled: true,
            emailChannels: [{ enabled: false, email: 'test@example.com' }], // Disabled channel
          },
        },
      ]);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const result = (await (service as any).detectSilentSkips(new Date())) as NotificationAlert[];

      expect(result).toHaveLength(0);
    });
  });

  describe('detectResolutionAnomalies', () => {
    it('should alert on sudden spike in NONE resolutions', async () => {
      // First call: Previous window count
      mockPrisma.notificationDeliveryLog.count.mockResolvedValueOnce(100);
      // Second call: Current window count
      mockPrisma.notificationDeliveryLog.count.mockResolvedValueOnce(200);
      // Diff = 100, Baseline = 100, Deviation = 1.0 (100% > 50%)

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const result = (await (service as any).detectResolutionAnomalies(
        new Date(),
      )) as NotificationAlert[];

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('RESOLUTION_ANOMALY');
      expect(result[0].metadata.diff).toBe(100);
    });

    it('should ignore small absolute changes', async () => {
      // First call: Previous window count
      mockPrisma.notificationDeliveryLog.count.mockResolvedValueOnce(5);
      // Second call: Current window count
      mockPrisma.notificationDeliveryLog.count.mockResolvedValueOnce(10);
      // Diff = 5, < 10 (MIN_ABSOLUTE_CHANGE)

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const result = (await (service as any).detectResolutionAnomalies(
        new Date(),
      )) as NotificationAlert[];

      expect(result).toHaveLength(0);
    });
  });
});
