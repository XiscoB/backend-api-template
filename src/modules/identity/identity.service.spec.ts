import { ForbiddenException } from '@nestjs/common';
import { Identity } from '@prisma/client';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

type IdentityRepositoryMock = {
  findOrCreate: jest.MockedFunction<IdentityRepository['findOrCreate']>;
  findByExternalUserId: jest.MockedFunction<IdentityRepository['findByExternalUserId']>;
  findById: jest.MockedFunction<IdentityRepository['findById']>;
  updateLastActivity: jest.MockedFunction<IdentityRepository['updateLastActivity']>;
  existsByExternalUserId: jest.MockedFunction<IdentityRepository['existsByExternalUserId']>;
  updateSuspensionStatus: jest.MockedFunction<IdentityRepository['updateSuspensionStatus']>;
  updateAnonymizationStatus: jest.MockedFunction<IdentityRepository['updateAnonymizationStatus']>;
  updateBannedStatus: jest.MockedFunction<IdentityRepository['updateBannedStatus']>;
  setDeletedAt: jest.MockedFunction<IdentityRepository['setDeletedAt']>;
  findPendingFinalDeletion: jest.MockedFunction<IdentityRepository['findPendingFinalDeletion']>;
  findApproachingFinalDeletion: jest.MockedFunction<
    IdentityRepository['findApproachingFinalDeletion']
  >;
  updateFlaggedStatus: jest.MockedFunction<IdentityRepository['updateFlaggedStatus']>;
};

const createIdentity = (overrides?: Partial<Identity>): Identity => ({
  id: 'identity-1',
  externalUserId: 'jwt-sub-1',
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

const createRepositoryMock = (): IdentityRepositoryMock => ({
  findOrCreate: jest.fn<Promise<Identity>, [string]>(),
  findByExternalUserId: jest.fn<Promise<Identity | null>, [string]>(),
  findById: jest.fn<Promise<Identity | null>, [string]>(),
  updateLastActivity: jest.fn<Promise<Identity>, [string]>(),
  existsByExternalUserId: jest.fn<Promise<boolean>, [string]>(),
  updateSuspensionStatus: jest.fn<Promise<Identity>, [string, boolean]>(),
  updateAnonymizationStatus: jest.fn<Promise<Identity>, [string, boolean]>(),
  updateBannedStatus: jest.fn<Promise<Identity>, [string, boolean]>(),
  setDeletedAt: jest.fn<Promise<Identity>, [string, Date | null]>(),
  findPendingFinalDeletion: jest.fn<Promise<Identity[]>, [number, number]>(),
  findApproachingFinalDeletion: jest.fn<Promise<Identity[]>, [number, number, number]>(),
  updateFlaggedStatus: jest.fn<Promise<Identity>, [string, boolean]>(),
});

describe('IdentityService', () => {
  let service: IdentityService;
  let repository: IdentityRepositoryMock;

  beforeEach(() => {
    repository = createRepositoryMock();
    service = new IdentityService(repository as never);
  });

  it('resolves identity strictly from external user id (JWT sub boundary)', async () => {
    // Architectural invariant: JWT sub is only used at request boundary,
    // then translated to internal Identity for domain ownership.
    const resolvedIdentity = createIdentity({
      id: 'identity-internal-7',
      externalUserId: 'jwt-sub-7',
    });
    repository.findOrCreate.mockResolvedValue(resolvedIdentity);

    const result = await service.resolveIdentity('jwt-sub-7');

    expect(repository.findOrCreate).toHaveBeenCalledWith('jwt-sub-7');
    expect(result.id).toBe('identity-internal-7');
    expect(result.externalUserId).toBe('jwt-sub-7');
  });

  it('fails closed for banned identities before any lower-priority states', async () => {
    // Architectural invariant: permanent ban has highest policy priority.
    repository.findOrCreate.mockResolvedValue(
      createIdentity({
        isBanned: true,
        deletedAt: new Date('2026-02-20T00:00:00.000Z'),
        isSuspended: true,
        anonymized: true,
      }),
    );

    await expect(service.resolveIdentityWithPolicyEnforcement('jwt-sub-blocked')).rejects.toThrow(
      new ForbiddenException('Account is permanently banned'),
    );
  });

  it('fails closed for pending deletion identities', async () => {
    repository.findOrCreate.mockResolvedValue(
      createIdentity({ deletedAt: new Date('2026-02-20T00:00:00.000Z') }),
    );

    await expect(service.resolveIdentityWithPolicyEnforcement('jwt-sub-pending')).rejects.toThrow(
      new ForbiddenException('Account deletion is pending'),
    );
  });

  it('fails closed for suspended identities', async () => {
    repository.findOrCreate.mockResolvedValue(createIdentity({ isSuspended: true }));

    await expect(service.resolveIdentityWithPolicyEnforcement('jwt-sub-suspended')).rejects.toThrow(
      new ForbiddenException('Account is suspended'),
    );
  });

  it('allows active identities and returns internal ownership anchor', async () => {
    // Architectural invariant: domain logic receives Identity.id, not raw JWT sub.
    const identity = createIdentity({ id: 'identity-domain-owner-9', externalUserId: 'jwt-sub-9' });
    repository.findOrCreate.mockResolvedValue(identity);

    const result = await service.resolveIdentityWithPolicyEnforcement('jwt-sub-9');

    expect(result.id).toBe('identity-domain-owner-9');
    expect(result.externalUserId).toBe('jwt-sub-9');
  });
});
