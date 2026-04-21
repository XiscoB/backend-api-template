import { GdprTableConfig } from '../gdpr.registry';
import { GdprOwnershipResolutionStrategy } from './gdpr-ownership-resolution.strategy';

const table = (userField: string): GdprTableConfig => ({
  modelName: `Model_${userField}`,
  tableName: `table_${userField}`,
  userField,
  export: true,
  delete: { strategy: 'DELETE' },
  suspend: { strategy: 'DELETE', backup: true },
});

describe('GdprOwnershipResolutionStrategy', () => {
  it('resolves identityId directly', async () => {
    const prisma = {
      userNotificationProfile: {
        findUnique: jest.fn(),
      },
    };

    const strategy = new GdprOwnershipResolutionStrategy(prisma);
    const result = await strategy.resolveOwnershipKey('identityId', 'identity-1');

    expect(result).toBe('identity-1');
  });

  it('resolves notificationProfileId through profile lookup', async () => {
    const prisma = {
      userNotificationProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
    };

    const strategy = new GdprOwnershipResolutionStrategy(prisma);
    const result = await strategy.resolveOwnershipKey('notificationProfileId', 'identity-1');

    expect(result).toBe('profile-1');
  });

  it('returns direct identity fallback for unknown userField', async () => {
    const prisma = {
      userNotificationProfile: {
        findUnique: jest.fn(),
      },
    };

    const strategy = new GdprOwnershipResolutionStrategy(prisma);
    const result = await strategy.resolveOwnershipKey('customOwnership', 'identity-1');

    expect(result).toBe('identity-1');
  });

  it('resolves unique userFields only once in bulk', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'profile-2' });
    const prisma = {
      userNotificationProfile: {
        findUnique,
      },
    };

    const strategy = new GdprOwnershipResolutionStrategy(prisma);
    const map = await strategy.resolveAllOwnershipKeys(
      [table('identityId'), table('notificationProfileId'), table('notificationProfileId')],
      'identity-2',
    );

    expect(map.get('identityId')).toBe('identity-2');
    expect(map.get('notificationProfileId')).toBe('profile-2');
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
