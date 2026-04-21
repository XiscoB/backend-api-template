/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsDigestJob } from './reports-digest.job';
import { ReportsService } from '../reports.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { IdentityService } from '../../identity/identity.service';
import { Identity } from '@prisma/client';

describe('ReportsDigestJob', () => {
  let job: ReportsDigestJob;
  let reportsService: jest.Mocked<ReportsService>;
  let notificationService: jest.Mocked<NotificationsService>;
  let identityService: jest.Mocked<IdentityService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsDigestJob,
        {
          provide: ReportsService,
          useValue: {
            countUnresolved: jest.fn(),
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
            getOrCreateSystemIdentity: jest.fn(),
          },
        },
      ],
    }).compile();

    job = module.get<ReportsDigestJob>(ReportsDigestJob);
    reportsService = module.get(ReportsService);
    notificationService = module.get(NotificationsService);
    identityService = module.get(IdentityService);
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  it('should do nothing if no pending reports', async () => {
    reportsService.countUnresolved.mockResolvedValue(0);

    await job.run();

    expect(reportsService.countUnresolved).toHaveBeenCalled();
    expect(identityService.getOrCreateSystemIdentity).not.toHaveBeenCalled();
    expect(notificationService.notifyByIdentityId).not.toHaveBeenCalled();
  });

  it('should emit notification if pending reports exist', async () => {
    const mockSystemIdentity = { id: 'system-uuid' } as Identity;
    reportsService.countUnresolved.mockResolvedValue(5);
    identityService.getOrCreateSystemIdentity.mockResolvedValue(mockSystemIdentity);

    await job.run();

    expect(reportsService.countUnresolved).toHaveBeenCalled();
    expect(identityService.getOrCreateSystemIdentity).toHaveBeenCalled();
    expect(notificationService.notifyByIdentityId).toHaveBeenCalledWith({
      identityId: 'system-uuid',
      type: 'ADMIN_REPORTS_DIGEST',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      payload: expect.objectContaining({
        pendingCount: 5,
      }) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });
  });
});
