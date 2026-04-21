import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { CreateReportDto } from './dto/report.dto';

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrismaService = {
    report: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  mockPrismaService.$transaction.mockImplementation(
    (callback: (client: typeof mockPrismaService) => Promise<unknown>) =>
      callback(mockPrismaService),
  );

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile();

    service = module.get<ReportsService>(ReportsService);

    jest.clearAllMocks();
  });

  describe('createReport', () => {
    it('should create a report with initial state resolved=false, valid=null', async () => {
      const dto: CreateReportDto = {
        contentType: 'post',
        category: 'spam',
        source: 'user',
        details: 'spammy content',
      };
      const reporterId = 'reporter-uuid';
      const expectedReport = { id: 'report-1', ...dto, resolved: false, valid: null };

      mockPrismaService.report.create.mockResolvedValue(expectedReport);

      const result = await service.createReport(dto, reporterId);

      expect(mockPrismaService.report.create).toHaveBeenCalledWith({
        data: {
          reporterIdentityId: reporterId,
          reportedIdentityId: undefined,
          reportedContentId: undefined,
          contentType: dto.contentType,
          category: dto.category,
          details: dto.details,
          reportedContentSnapshot: undefined,
          reportedUserSnapshot: undefined,
          source: dto.source,
          resolved: false,
          valid: null,
        },
      });
      expect(result).toBe(expectedReport);
    });
  });

  describe('resolveReport', () => {
    const reportId = 'report-1';
    const adminId = 'admin-uuid';
    const resolution = { valid: true };

    it('should successfully resolve an unresolved report', async () => {
      const unresolvedReport = { id: reportId, resolved: false };
      const updatedReport = {
        ...unresolvedReport,
        resolved: true,
        valid: true,
        resolvedByIdentityId: adminId,
      };

      mockPrismaService.report.findUnique.mockResolvedValue(unresolvedReport);
      mockPrismaService.report.update.mockResolvedValue(updatedReport);

      const result = await service.resolveReport(reportId, resolution, adminId);

      expect(mockPrismaService.report.findUnique).toHaveBeenCalledWith({ where: { id: reportId } });
      expect(mockPrismaService.report.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: reportId },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
          data: expect.objectContaining({
            resolved: true,
            valid: true,
            resolvedByIdentityId: adminId,
          }),
        }),
      );
      expect(result).toBe(updatedReport);
    });

    it('should throw ConflictException if report is already resolved', async () => {
      const resolvedReport = { id: reportId, resolved: true };

      mockPrismaService.report.findUnique.mockResolvedValue(resolvedReport);

      await expect(service.resolveReport(reportId, resolution, adminId)).rejects.toThrow(
        ConflictException,
      );

      expect(mockPrismaService.report.findUnique).toHaveBeenCalledWith({ where: { id: reportId } });
      expect(mockPrismaService.report.update).not.toHaveBeenCalled();
    });
  });
});
