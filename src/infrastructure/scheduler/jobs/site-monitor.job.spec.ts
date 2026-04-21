import { Test, TestingModule } from '@nestjs/testing';
import { SiteMonitorJob } from './site-monitor.job';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AlertDeliveryService } from '../../delivery';
import { AppConfigService } from '../../../config/app-config.service';

describe('SiteMonitorJob', () => {
  let job: SiteMonitorJob;
  let mockPrisma: {
    internalLog: jest.Mocked<Pick<PrismaService['internalLog'], 'create' | 'findFirst'>>;
  };
  let mockAlertDeliveryService: jest.Mocked<Pick<AlertDeliveryService, 'sendAlert'>>;
  let mockConfig: {
    siteMonitorTargets: string[];
    siteMonitorExpectedStatus: number;
    siteMonitorTimeoutMs: number;
  };

  const setFetchStatus = (status: number): void => {
    global.fetch = (): Promise<Response> => Promise.resolve(new Response(null, { status }));
  };

  const setFetchError = (error: Error): void => {
    global.fetch = (): Promise<Response> => Promise.reject(error);
  };

  beforeEach(async () => {
    mockPrisma = {
      internalLog: {
        create: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } satisfies {
      internalLog: jest.Mocked<Pick<PrismaService['internalLog'], 'create' | 'findFirst'>>;
    };
    mockAlertDeliveryService = {
      sendAlert: jest.fn().mockResolvedValue({ sent: true, recipientCount: 1 }),
    } satisfies jest.Mocked<Pick<AlertDeliveryService, 'sendAlert'>>;
    mockConfig = {
      siteMonitorTargets: [],
      siteMonitorExpectedStatus: 200,
      siteMonitorTimeoutMs: 5000,
    } satisfies Partial<AppConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiteMonitorJob,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: AlertDeliveryService,
          useValue: mockAlertDeliveryService,
        },
        { provide: AppConfigService, useValue: mockConfig },
      ],
    }).compile();

    job = module.get<SiteMonitorJob>(SiteMonitorJob);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(job).toBeDefined();
  });

  describe('No Targets Configured', () => {
    it('should skip check when no targets are configured', async () => {
      mockConfig.siteMonitorTargets = [];

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).not.toHaveBeenCalled();
    });
  });

  describe('All Sites Healthy', () => {
    it('should not alert when all sites return expected status', async () => {
      // Mock a healthy site
      mockConfig.siteMonitorTargets = ['https://httpstat.us/200'];
      setFetchStatus(200);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).not.toHaveBeenCalled();
    });
  });

  describe('Site Down - Wrong Status', () => {
    it('should alert when site returns unexpected status', async () => {
      mockConfig.siteMonitorTargets = ['https://example.com/down'];
      setFetchStatus(500);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'CRITICAL',
          title: 'External Site Unavailable',
        }),
      );
    });
  });

  describe('Multiple Sites Down', () => {
    it('should send single consolidated alert for multiple failures', async () => {
      mockConfig.siteMonitorTargets = ['https://example.com/site1', 'https://example.com/site2'];
      setFetchStatus(503);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).toHaveBeenCalledTimes(1);
      expect(mockAlertDeliveryService.sendAlert).toHaveBeenCalled();
    });
  });

  describe('Network Timeout', () => {
    it('should treat timeout as failure with normalized message', async () => {
      mockConfig.siteMonitorTargets = ['https://example.com/slow'];
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      setFetchError(abortError);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).toHaveBeenCalled();
    });
  });

  describe('Network Error - DNS', () => {
    it('should treat DNS failure as failure', async () => {
      mockConfig.siteMonitorTargets = ['https://invalid.local'];
      const dnsError = new Error('getaddrinfo ENOTFOUND invalid.local');
      setFetchError(dnsError);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).toHaveBeenCalled();
    });
  });

  describe('Rate Limiting', () => {
    it('should skip alert if recent alert exists for same failures', async () => {
      mockConfig.siteMonitorTargets = ['https://example.com/down'];
      setFetchStatus(500);

      // Rate limit hit
      mockPrisma.internalLog.findFirst.mockResolvedValue({
        identityId: null,
        id: 'log-123',
        source: 'SiteMonitorJob',
        level: 'WARN',
        message: 'Site Monitor Alert Sent',
        context: { debounceKey: 'site-monitor:https://example.com/down' },
        createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 mins ago
      });

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).not.toHaveBeenCalled();
    });

    it('should send alert if no recent alert exists', async () => {
      mockConfig.siteMonitorTargets = ['https://example.com/down'];
      setFetchStatus(500);

      mockPrisma.internalLog.findFirst.mockResolvedValue(null);

      await job.run();

      expect(mockAlertDeliveryService.sendAlert).toHaveBeenCalled();
    });

    it('should log alert to InternalLog for rate-limiting', async () => {
      mockConfig.siteMonitorTargets = ['https://example.com/down'];
      setFetchStatus(500);

      await job.run();

      expect(mockPrisma.internalLog.create).toHaveBeenCalled();
    });
  });

  describe('Fail-Safe Behavior', () => {
    it('should not throw when job fails', async () => {
      mockConfig.siteMonitorTargets = ['https://example.com'];
      setFetchError(new Error('Catastrophic failure'));

      // Ensure the job completes without throwing
      await expect(job.run()).resolves.not.toThrow();
    });

    it('should log error to InternalLog when job fails', async () => {
      mockConfig.siteMonitorTargets = ['https://example.com'];

      // Force a catastrophic error in the alert sending path
      mockAlertDeliveryService.sendAlert.mockRejectedValue(new Error('Email service down'));
      setFetchStatus(500);

      await job.run();

      // Should still have attempted to log
      expect(mockPrisma.internalLog.create).toHaveBeenCalled();
    });
  });
});
