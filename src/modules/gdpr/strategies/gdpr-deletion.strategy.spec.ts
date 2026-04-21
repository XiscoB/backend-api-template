import { GdprDeletionStrategy } from './gdpr-deletion.strategy';

describe('GdprDeletionStrategy', () => {
  it('returns model-not-found when model is missing', async () => {
    const prisma = {};
    const strategy = new GdprDeletionStrategy(prisma);

    const result = await strategy.deleteRows('Profile', 'identityId', 'identity-1');

    expect(result.kind).toBe('MODEL_NOT_FOUND');
  });

  it('deletes rows and returns affected count', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma = {
      profile: {
        deleteMany,
      },
    };

    const strategy = new GdprDeletionStrategy(prisma);
    const result = await strategy.deleteRows('Profile', 'identityId', 'identity-1');

    expect(result).toEqual({ kind: 'APPLIED', count: 3 });
    expect(deleteMany).toHaveBeenCalledWith({ where: { identityId: 'identity-1' } });
  });
});
