import { Prisma } from '@prisma/client';
import { findUnclassifiedOwnershipModels } from './gdpr-ownership.check';

const getIdentityOwnedModelNames = (): string[] =>
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'identityId'))
    .map((model) => model.name);

describe('findUnclassifiedOwnershipModels', () => {
  it('returns no violations when all identity-owned models are explicitly classified', () => {
    const identityOwnedModels = getIdentityOwnedModelNames();

    const violations = findUnclassifiedOwnershipModels(Prisma.dmmf, identityOwnedModels, []);

    expect(violations).toEqual([]);
  });

  it('detects unclassified identity-owned models when classification is incomplete', () => {
    const identityOwnedModels = getIdentityOwnedModelNames();
    const intentionallyClassified = identityOwnedModels.slice(0, 2);

    const violations = findUnclassifiedOwnershipModels(Prisma.dmmf, intentionallyClassified, []);

    expect(violations.length).toBe(identityOwnedModels.length - intentionallyClassified.length);
    expect(violations.every((v) => v.message.includes('not classified in GDPR registry'))).toBe(
      true,
    );
  });

  it('META: unclassified identity-owned models always fail the ownership integrity check', () => {
    // This meta-test protects the architectural guarantee itself:
    // any model exposing identityId MUST be classified in GDPR registry.
    const identityOwnedModels = getIdentityOwnedModelNames();

    const violations = findUnclassifiedOwnershipModels(Prisma.dmmf, [], []);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations).toHaveLength(identityOwnedModels.length);
    expect(violations.every((v) => v.message.includes('not classified in GDPR registry'))).toBe(
      true,
    );
    expect(violations.map((v) => v.modelName)).toEqual(expect.arrayContaining(identityOwnedModels));
  });
});
