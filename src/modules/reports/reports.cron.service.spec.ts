import { Test, TestingModule } from '@nestjs/testing';
import { ReportsCronService } from './reports.cron.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { InternalLogService } from '../gdpr/internal-log.service';
import { InternalLogLevel } from '@prisma/client';

describe('ReportsCronService', () => {
  let service: ReportsCronService;

  const mockPrismaService = {
    report: {
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockInternalLogService = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsCronService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: InternalLogService, useValue: mockInternalLogService },
      ],
    }).compile();

    service = module.get<ReportsCronService>(ReportsCronService);

    jest.clearAllMocks();
  });

  describe('processReportDigest', () => {
    it('should do nothing if no pending reports exist', async () => {
      mockPrismaService.report.findMany.mockResolvedValue([]);

      await service.processReportDigest();

      expect(mockPrismaService.report.findMany).toHaveBeenCalledWith({
        where: { resolved: false },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        select: expect.any(Object),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        orderBy: expect.any(Object),
      });
      expect(mockInternalLogService.log).not.toHaveBeenCalled();
    });

    it('should aggregate pending reports and log digest', async () => {
      const now = new Date();
      const reports = [
        { id: '1', contentType: 'post', createdAt: now },
        { id: '2', contentType: 'post', createdAt: now },
        { id: '3', contentType: 'comment', createdAt: now },
      ];

      mockPrismaService.report.findMany.mockResolvedValue(reports);

      await service.processReportDigest();

      expect(mockInternalLogService.log).toHaveBeenCalledWith({
        level: InternalLogLevel.INFO,
        source: 'ReportsCronService',
        message: 'Report Digest: 3 pending reports',
        context: {
          pendingCount: 3,
          oldestReportAt: now,
          byContentType: {
            post: 2,
            comment: 1,
          },
        },
      });
    });

    it('should NOT mutate any data', async () => {
      mockPrismaService.report.findMany.mockResolvedValue([]);

      await service.processReportDigest();

      expect(mockPrismaService.report.update).not.toHaveBeenCalled();
      expect(mockPrismaService.report.delete).not.toHaveBeenCalled();
    });
  });
});
