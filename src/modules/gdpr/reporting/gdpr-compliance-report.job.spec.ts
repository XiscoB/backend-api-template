/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { GdprComplianceReportJob } from './gdpr-compliance-report.job';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';
import { Request, RequestStatus, RequestType } from '@prisma/client';

const createMockRequest = (overrides: Partial<Request> = {}): Request => ({
  id: 'req-default',
  identityId: 'user-default',
  requestType: RequestType.GDPR_EXPORT,
  status: RequestStatus.PENDING,
  dataPayload: {},
  errorMessage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  processedAt: null,
  expiresAt: null,
  lastDownloadedAt: null,
  downloadCount: 0,
  requestedAt: new Date(),
  ...overrides,
});

describe('GdprComplianceReportJob', () => {
  let job: GdprComplianceReportJob;
  let notificationsService: NotificationsService;
  let prismaService: PrismaService;

  const mockSystemIdentity = { id: 'system-identity-id' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GdprComplianceReportJob,
        {
          provide: PrismaService,
          useValue: {
            request: {
              count: jest.fn().mockResolvedValue(0),
              findMany: jest.fn().mockResolvedValue([]),
              findFirst: jest.fn().mockResolvedValue(null),
            },
            gdprAuditLog: {
              findFirst: jest.fn().mockResolvedValue({ id: 'audit-1' }),
            },
            gdprExportFile: {
              count: jest.fn().mockResolvedValue(0),
            },
            deletionLegalHolds: {
              count: jest.fn().mockResolvedValue(0),
            },
            deletionLegalHold: {
              count: jest.fn().mockResolvedValue(0),
            },
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyByIdentityId: jest.fn().mockResolvedValue(undefined),
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

    job = module.get<GdprComplianceReportJob>(GdprComplianceReportJob);
    notificationsService = module.get<NotificationsService>(NotificationsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  it('should aggregate metrics and send notification', async () => {
    // Setup mocks
    jest
      .spyOn(prismaService.request, 'count')
      .mockResolvedValueOnce(5) // Export created
      .mockResolvedValueOnce(2) // Delete created
      .mockResolvedValueOnce(1) // Suspend created
      .mockResolvedValueOnce(8) // Completed
      .mockResolvedValueOnce(0) // Failed
      .mockResolvedValueOnce(0) // Expired
      .mockResolvedValueOnce(3) // Pending
      .mockResolvedValueOnce(0); // Stuck

    jest.spyOn(prismaService.request, 'findMany').mockResolvedValueOnce([
      createMockRequest({
        id: 'req-1',
        requestedAt: new Date('2023-01-01T10:00:00Z'),
        processedAt: new Date('2023-01-01T10:01:00Z'),
      }), // 60s
      createMockRequest({
        id: 'req-2',
        requestedAt: new Date('2023-01-01T10:00:00Z'),
        processedAt: new Date('2023-01-01T10:02:00Z'),
      }), // 120s
    ]);

    jest.spyOn(prismaService.request, 'findFirst').mockResolvedValueOnce(
      createMockRequest({
        id: 'req-old',
        requestedAt: new Date(Date.now() - 3600000), // 1 hour ago
      }),
    );

    await job.run();

    expect(notificationsService.notifyByIdentityId).toHaveBeenCalledWith({
      identityId: mockSystemIdentity.id,
      actorIdentityId: mockSystemIdentity.id,
      type: 'GDPR_COMPLIANCE_REPORT',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      payload: expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        overview: expect.objectContaining({
          created: { EXPORT: 5, DELETE: 2, SUSPEND: 1 },
          completed: 8,
          pending: 3,
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        performance: expect.objectContaining({
          avgProcessingTimeMs: 90000,
          maxProcessingTimeMs: 120000,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          oldestPendingRequestAgeHours: expect.closeTo(1, 0.1),
        }),
      }),
    });
  });
});
