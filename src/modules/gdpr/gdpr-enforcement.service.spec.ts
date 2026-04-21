import { GdprEnforcementService } from './gdpr-enforcement.service';
import { findUnclassifiedOwnershipModels } from './gdpr-ownership.check';
import { validateGdprRegistry } from './gdpr.registry';

jest.mock('./gdpr-ownership.check', () => ({
  findUnclassifiedOwnershipModels: jest.fn(),
}));

jest.mock('./gdpr.registry', () => ({
  GDPR_REGISTRY: [],
  GDPR_EXCLUDED_TABLES: [],
  validateGdprRegistry: jest.fn(),
  isModelRegistered: jest.fn(() => false),
  getModelConfig: jest.fn(() => null),
  getEffectiveSuspendPiiFields: jest.fn(() => []),
}));

describe('GdprEnforcementService', () => {
  const mockedFindUnclassified = jest.mocked(findUnclassifiedOwnershipModels);
  const mockedValidateRegistry = jest.mocked(validateGdprRegistry);

  beforeEach(() => {
    mockedFindUnclassified.mockReset();
    mockedValidateRegistry.mockReset();
    mockedFindUnclassified.mockReturnValue([]);
    mockedValidateRegistry.mockReturnValue([]);
  });

  it('passes cleanly when ownership and registry checks report no violations', () => {
    const service = new GdprEnforcementService();

    const result = service.runEnforcementCheck();

    expect(result).toEqual([]);
    expect(mockedValidateRegistry).toHaveBeenCalledTimes(1);
    expect(mockedFindUnclassified).toHaveBeenCalledTimes(1);
  });

  it('fails closed by returning explicit violations in non-production mode', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    mockedValidateRegistry.mockReturnValue([
      { modelName: 'Profile', tableName: 'profiles', error: 'Missing delete strategy' },
    ]);
    mockedFindUnclassified.mockReturnValue([
      {
        modelName: 'OrphanedOwnedTable',
        message: 'Model has identityId but is not classified in GDPR registry',
      },
    ]);

    const service = new GdprEnforcementService();
    const result = service.runEnforcementCheck();

    expect(result).toHaveLength(2);
    expect(result.map((v) => v.modelName)).toEqual(
      expect.arrayContaining(['Profile', 'OrphanedOwnedTable']),
    );

    process.env.NODE_ENV = previousNodeEnv;
  });

  it('fails startup in production when any ownership integrity violation exists', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    mockedFindUnclassified.mockReturnValue([
      {
        modelName: 'UnclassifiedOwnedModel',
        message: 'Model has identityId but is not classified in GDPR registry',
      },
    ]);

    const service = new GdprEnforcementService();

    expect(() => service.runEnforcementCheck()).toThrow(/GDPR Registry Enforcement Failed/i);

    process.env.NODE_ENV = previousNodeEnv;
  });
});
