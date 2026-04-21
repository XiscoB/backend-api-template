import { Test, TestingModule } from '@nestjs/testing';
import { AlertDeliveryService } from './alert-delivery.service';
import { RecipientGroupService } from './recipient-group.service';
import { EmailService } from '../email/email.service';
import { RecipientGroup } from './delivery.types';

describe('AlertDeliveryService', () => {
  let service: AlertDeliveryService;
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
        AlertDeliveryService,
        { provide: EmailService, useValue: mockEmailService },
        { provide: RecipientGroupService, useValue: mockRecipientGroupService },
      ],
    }).compile();

    service = module.get<AlertDeliveryService>(AlertDeliveryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendAlert', () => {
    it('should return sent: true when recipients exist and email succeeds', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue(['admin@example.com']);
      mockEmailService.send.mockResolvedValue({ acceptedCount: 1 });

      const result = await service.sendAlert({
        recipientGroup: RecipientGroup.INFRA_ALERTS,
        severity: 'CRITICAL',
        title: 'Test Alert',
        htmlBody: '<p>Test body</p>',
      });

      expect(result.sent).toBe(true);
      expect(result.recipientCount).toBe(1);
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [{ email: 'admin@example.com' }],
          rawSubject: expect.stringContaining('[ALERT][CRITICAL]') as string,
        }),
      );
    });

    it('should return sent: false with skippedReason when no recipients', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue([]);

      const result = await service.sendAlert({
        recipientGroup: RecipientGroup.INFRA_ALERTS,
        severity: 'WARNING',
        title: 'Test Alert',
        htmlBody: '<p>Test</p>',
      });

      expect(result.sent).toBe(false);
      expect(result.skippedReason).toBe('no_recipients');
      expect(mockEmailService.send).not.toHaveBeenCalled();
    });

    it('should return sent: false with skippedReason when email fails', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue(['admin@example.com']);
      mockEmailService.send.mockRejectedValue(new Error('SMTP error'));

      const result = await service.sendAlert({
        recipientGroup: RecipientGroup.INFRA_ALERTS,
        severity: 'CRITICAL',
        title: 'Test Alert',
        htmlBody: '<p>Test</p>',
      });

      expect(result.sent).toBe(false);
      expect(result.skippedReason).toBe('email_failed');
    });

    it('should never throw (fail-safe)', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue(['admin@example.com']);
      mockEmailService.send.mockRejectedValue(new Error('Connection refused'));

      // Should not throw
      const result = await service.sendAlert({
        recipientGroup: RecipientGroup.INFRA_ALERTS,
        severity: 'INFO',
        title: 'Test',
        htmlBody: '<p>Test</p>',
      });

      expect(result.sent).toBe(false);
      expect(result.skippedReason).toBe('email_failed');
    });

    it('should format subject with [ALERT][severity]', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue(['admin@example.com']);
      mockEmailService.send.mockResolvedValue({ acceptedCount: 1 });

      await service.sendAlert({
        recipientGroup: RecipientGroup.INFRA_ALERTS,
        severity: 'WARNING',
        title: 'Job Delayed',
        htmlBody: '<p>Details</p>',
      });

      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          rawSubject: '[ALERT][WARNING] Job Delayed',
        }),
      );
    });

    it('should send to multiple recipients', async () => {
      mockRecipientGroupService.resolveGroup.mockReturnValue([
        'admin@example.com',
        'ops@example.com',
      ]);
      mockEmailService.send.mockResolvedValue({ acceptedCount: 2 });

      const result = await service.sendAlert({
        recipientGroup: RecipientGroup.INFRA_ALERTS,
        severity: 'CRITICAL',
        title: 'Test',
        htmlBody: '<p>Test</p>',
      });

      expect(result.sent).toBe(true);
      expect(result.recipientCount).toBe(2);
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: [{ email: 'admin@example.com' }, { email: 'ops@example.com' }],
        }),
      );
    });
  });
});
