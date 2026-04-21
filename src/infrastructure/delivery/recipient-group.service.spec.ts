import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RecipientGroupService } from './recipient-group.service';
import { RecipientGroup } from './delivery.types';

describe('RecipientGroupService', () => {
  let service: RecipientGroupService;
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RecipientGroupService, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    service = module.get<RecipientGroupService>(RecipientGroupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveGroup', () => {
    it('should return empty array when env var is missing', () => {
      mockConfigService.get.mockReturnValue('');

      const result = service.resolveGroup(RecipientGroup.INFRA_ALERTS);

      expect(result).toEqual([]);
      expect(mockConfigService.get).toHaveBeenCalledWith('INFRA_ALERT_RECIPIENTS', '');
    });

    it('should return empty array when env var is whitespace only', () => {
      mockConfigService.get.mockReturnValue('   ');

      const result = service.resolveGroup(RecipientGroup.INFRA_ALERTS);

      expect(result).toEqual([]);
    });

    it('should parse comma-separated emails correctly', () => {
      mockConfigService.get.mockReturnValue('admin@example.com,ops@example.com');

      const result = service.resolveGroup(RecipientGroup.INFRA_ALERTS);

      expect(result).toEqual(['admin@example.com', 'ops@example.com']);
    });

    it('should trim whitespace from emails', () => {
      mockConfigService.get.mockReturnValue('  admin@example.com , ops@example.com  ');

      const result = service.resolveGroup(RecipientGroup.INFRA_ALERTS);

      expect(result).toEqual(['admin@example.com', 'ops@example.com']);
    });

    it('should filter out empty strings', () => {
      mockConfigService.get.mockReturnValue('admin@example.com,,ops@example.com,');

      const result = service.resolveGroup(RecipientGroup.INFRA_ALERTS);

      expect(result).toEqual(['admin@example.com', 'ops@example.com']);
    });

    it('should use correct env var for each group', () => {
      const groups = [
        { group: RecipientGroup.INFRA_ALERTS, envVar: 'INFRA_ALERT_RECIPIENTS' },
        { group: RecipientGroup.PLATFORM_REPORTS, envVar: 'PLATFORM_REPORT_RECIPIENTS' },
        {
          group: RecipientGroup.NOTIFICATION_HEALTH_REPORTS,
          envVar: 'NOTIFICATION_HEALTH_REPORT_RECIPIENTS',
        },
        {
          group: RecipientGroup.SAFETY_MODERATION_REPORTS,
          envVar: 'SAFETY_MODERATION_REPORT_RECIPIENTS',
        },
        { group: RecipientGroup.GDPR_REPORTS, envVar: 'GDPR_REPORT_RECIPIENTS' },
        { group: RecipientGroup.WEEKLY_REPORTS, envVar: 'WEEKLY_REPORT_RECIPIENTS' },
      ];

      for (const { group, envVar } of groups) {
        mockConfigService.get.mockReturnValue('test@example.com');
        service.resolveGroup(group);
        expect(mockConfigService.get).toHaveBeenCalledWith(envVar, '');
      }
    });
  });

  describe('hasRecipients', () => {
    it('should return false when env var is missing', () => {
      mockConfigService.get.mockReturnValue('');

      const result = service.hasRecipients(RecipientGroup.INFRA_ALERTS);

      expect(result).toBe(false);
    });

    it('should return true when recipients exist', () => {
      mockConfigService.get.mockReturnValue('admin@example.com');

      const result = service.hasRecipients(RecipientGroup.INFRA_ALERTS);

      expect(result).toBe(true);
    });

    it('should return false when only whitespace/empty values', () => {
      mockConfigService.get.mockReturnValue(' , , ');

      const result = service.hasRecipients(RecipientGroup.INFRA_ALERTS);

      expect(result).toBe(false);
    });
  });
});
