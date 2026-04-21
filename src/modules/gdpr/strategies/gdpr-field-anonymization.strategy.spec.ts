import { GdprTableConfig } from '../gdpr.registry';
import { GdprFieldAnonymizationStrategy } from './gdpr-field-anonymization.strategy';

const anonymizeConfig: GdprTableConfig = {
  modelName: 'NotificationLog',
  tableName: 'notification_logs',
  userField: 'identityId',
  export: true,
  delete: { strategy: 'ANONYMIZE', fields: ['payload'], replacement: 'FIXED' },
  suspend: { strategy: 'ANONYMIZE', backup: true, piiFields: ['payload'], replacement: 'FIXED' },
};

describe('GdprFieldAnonymizationStrategy', () => {
  it('returns skipped when ANONYMIZE table has no piiFields', async () => {
    const config: GdprTableConfig = {
      ...anonymizeConfig,
      suspend: {
        ...anonymizeConfig.suspend,
        piiFields: [],
      },
    };

    const prisma = {
      notificationLog: {
        updateMany: jest.fn(),
      },
    };

    const strategy = new GdprFieldAnonymizationStrategy(prisma);
    const result = await strategy.anonymizeRows(config, 'identity-1', 'SUSPEND');

    expect(result).toEqual({ kind: 'SKIPPED', reason: 'NO_PII_FIELDS' });
  });

  it('applies fixed placeholders in suspend mode', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      notificationLog: {
        updateMany,
      },
    };

    const strategy = new GdprFieldAnonymizationStrategy(prisma);
    const result = await strategy.anonymizeRows(anonymizeConfig, 'identity-1', 'SUSPEND');

    expect(result).toEqual({ kind: 'APPLIED', count: 2 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { identityId: 'identity-1' },
      data: { payload: '[SUSPENDED]' },
    });
  });

  it('returns model-not-found when update model is unavailable', async () => {
    const prisma = {};
    const strategy = new GdprFieldAnonymizationStrategy(prisma);

    const result = await strategy.anonymizeRows(anonymizeConfig, 'identity-1', 'DELETE');

    expect(result.kind).toBe('MODEL_NOT_FOUND');
  });
});
