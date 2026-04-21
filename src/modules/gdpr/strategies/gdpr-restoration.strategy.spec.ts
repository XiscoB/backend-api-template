import { GdprRestorationStrategy } from './gdpr-restoration.strategy';

describe('GdprRestorationStrategy', () => {
  it('returns model-not-found when restore model is missing', async () => {
    const prisma = {};
    const strategy = new GdprRestorationStrategy(prisma);

    const result = await strategy.restoreRows('Profile', [{ id: 'profile-1' }]);

    expect(result.kind).toBe('MODEL_NOT_FOUND');
  });

  it('restores rows with upsert and skips rows without id', async () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'profile-1' });
    const prisma = {
      profile: {
        upsert,
      },
    };

    const strategy = new GdprRestorationStrategy(prisma);
    const result = await strategy.restoreRows('Profile', [
      { displayName: 'NoId' },
      { id: 'profile-1', displayName: 'Alice' },
    ]);

    expect(result).toEqual({ kind: 'RESTORED', count: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      create: { id: 'profile-1', displayName: 'Alice' },
      update: { displayName: 'Alice' },
    });
  });
});
