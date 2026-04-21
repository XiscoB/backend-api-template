import { Test, TestingModule } from '@nestjs/testing';
import { ReportDeliveryService } from './report-delivery.service';
import { RecipientGroupService } from './recipient-group.service';
import { EmailService } from '../email/email.service';
import { RecipientGroup } from './delivery.types';

describe('ReportDeliveryService', () => {
  let service: ReportDeliveryService;
  let mockEmailService: { send: jest.Mock };
  let mockRecipientGroupService: { resolveGroup: jest.Mock };

  beforeEach(async () => {
    mockEmailService = {
      send: jest.fn(),
    };
    mockRecipientGroupService = {
      resolveGroup: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportDeliveryService,
        { provide: EmailService, useValue: mockEmailService },
        { provide: RecipientGroupService, useValue: mockRecipientGroupService },
      ],
    }).compile();

    service = module.get<ReportDeliveryService>(ReportDeliveryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendReport', () => {
    it('should return sent: true when recipients exist and email succeeds', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue(['exec@example.com']);
      mockEmailService.send.mockResolvedValue({ acceptedCount: 1 });

      const result = await service.sendReport({
        recipientGroup: RecipientGroup.WEEKLY_REPORTS,
        reportType: 'Weekly Growth Report',
        periodStart: new Date('2026-01-20'),
        periodEnd: new Date('2026-01-27'),
        htmlBody: '<p>Report content</p>',
      });

      expect(result.sent).toBe(true);
      expect(result.recipientCount).toBe(1);
    });

    it('should return sent: false with skippedReason when no recipients', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue([]);

      const result = await service.sendReport({
        recipientGroup: RecipientGroup.WEEKLY_REPORTS,
        reportType: 'Weekly Growth Report',
        periodStart: new Date(),
        periodEnd: new Date(),
        htmlBody: '<p>Report</p>',
      });

      expect(result.sent).toBe(false);
      expect(result.skippedReason).toBe('no_recipients');
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });

    it('should return sent: false with skippedReason when email fails', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue(['exec@example.com']);
      mockEmailService.send.mockRejectedValue(new Error('SMTP error'));

      const result = await service.sendReport({
        recipientGroup: RecipientGroup.WEEKLY_REPORTS,
        reportType: 'Weekly Growth Report',
        periodStart: new Date(),
        periodEnd: new Date(),
        htmlBody: '<p>Report</p>',
      });

      expect(result.sent).toBe(false);
      expect(result.skippedReason).toBe('email_failed');
    });

    it('should never throw (fail-safe)', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue(['exec@example.com']);
      mockEmailService.send.mockRejectedValue(new Error('Connection refused'));

      // Should not throw
      const result = await service.sendReport({
        recipientGroup: RecipientGroup.WEEKLY_REPORTS,
        reportType: 'Test Report',
        periodStart: new Date(),
        periodEnd: new Date(),
        htmlBody: '<p>Test</p>',
      });

      expect(result.sent).toBe(false);
      expect(result.skippedReason).toBe('email_failed');
    });

    it('should format subject with [WEEKLY REPORT]', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue(['exec@example.com']);
      mockEmailService.send.mockResolvedValue({ acceptedCount: 1 });

      await service.sendReport({
        recipientGroup: RecipientGroup.WEEKLY_REPORTS,
        reportType: 'Growth Report',
        periodStart: new Date('2026-01-20'),
        periodEnd: new Date('2026-01-27'),
        htmlBody: '<p>Report</p>',
      });

      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          rawSubject: expect.stringContaining('[WEEKLY REPORT] Growth Report') as string,
        }),
      );
    });
  });
});
