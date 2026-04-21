import { Identity } from '@prisma/client';
import { IdentityRepository } from './identity.repository';

type IdentityPrismaDelegate = {
  findUnique: jest.Mock;
  create: jest.Mock;
  upsert: jest.Mock;
};

type PrismaMock = {
  identity: IdentityPrismaDelegate;
};

const createIdentity = (overrides?: Partial<Identity>): Identity => ({
  id: 'identity-1',
  externalUserId: 'sub-1',
  createdAt: new Date('2026-02-20T00:00:00.000Z'),
  updatedAt: new Date('2026-02-20T00:00:00.000Z'),
  deletedAt: null,
  anonymized: false,
  isSuspended: false,
  isFlagged: false,
  isBanned: false,
  lastActivity: null,
  ...overrides,
});

describe('IdentityRepository', () => {
  let repository: IdentityRepository;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      identity: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
      },
    };
    repository = new IdentityRepository(prisma as never);
  });

  it('persists externalUserId at boundary and never writes raw value into identity id', async () => {
    // Architectural invariant: JWT sub is stored only in externalUserId.
    prisma.identity.upsert.mockResolvedValue(createIdentity({ externalUserId: 'jwt-sub-123' }));

    await repository.findOrCreate('jwt-sub-123');

    expect(prisma.identity.upsert).toHaveBeenCalledWith({
      where: { externalUserId: 'jwt-sub-123' },
      create: { externalUserId: 'jwt-sub-123' },
      update: {},
    });
  });

  it('rejects collision when internal identity id is mistakenly passed as JWT sub', async () => {
    // Architectural invariant: internal identity ids must not be reused as external ids.
    const internalIdentityId = 'f12b2f16-9d78-4fb0-986c-1e96f7fe3ce7';

    prisma.identity.findUnique.mockResolvedValueOnce(createIdentity({ id: internalIdentityId }));

    await expect(repository.findOrCreate(internalIdentityId)).rejects.toThrow(
      /Identity collision detected/i,
    );
    expect(prisma.identity.upsert).not.toHaveBeenCalled();
  });
});
