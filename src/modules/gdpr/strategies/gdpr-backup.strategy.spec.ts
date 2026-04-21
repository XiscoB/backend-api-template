import { GdprTableConfig } from '../gdpr.registry';
import { GdprBackupStrategy } from './gdpr-backup.strategy';

const tableConfig: GdprTableConfig = {
  modelName: 'Profile',
  tableName: 'profiles',
  userField: 'identityId',
  export: true,
  delete: { strategy: 'DELETE' },
  suspend: { strategy: 'DELETE', backup: true },
};

describe('GdprBackupStrategy', () => {
  it('returns model-not-found when prisma model does not exist', async () => {
    const prisma = {
      suspensionBackup: {
        create: jest.fn(),
      },
    };

    const strategy = new GdprBackupStrategy(prisma);
    const result = await strategy.loadRows(tableConfig, 'identity-1');

    expect(result.kind).toBe('MODEL_NOT_FOUND');
  });

  it('loads rows for matching ownership key', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'profile-1' }]);
    const prisma = {
      profile: {
        findMany,
      },
      suspensionBackup: {
        create: jest.fn(),
      },
    };

    const strategy = new GdprBackupStrategy(prisma);
    const result = await strategy.loadRows(tableConfig, 'identity-1');

    expect(result.kind).toBe('READY');
    if (result.kind === 'READY') {
      expect(result.rows).toHaveLength(1);
    }
    expect(findMany).toHaveBeenCalledWith({ where: { identityId: 'identity-1' } });
  });

  it('creates suspension backup snapshot with fixed metadata', async () => {
    const create: jest.MockedFunction<
      (args: {
        data: {
          suspensionUid: string;
          identityId: string;
          anonymizedUid: string;
          tableName: string;
          backupSchemaVersion: string;
          backupUsed: boolean;
        };
      }) => Promise<{ id: string }>
    > = jest.fn().mockResolvedValue({ id: 'backup-1' });
    const prisma = {
      profile: {
        findMany: jest.fn(),
      },
      suspensionBackup: {
        create,
      },
    };

    const strategy = new GdprBackupStrategy(prisma);

    await strategy.createBackup({
      suspensionUid: 'susp-1',
      identityId: 'identity-1',
      anonymizedUid: 'anon-1',
      modelName: 'Profile',
      rows: [{ id: 'profile-1', displayName: 'Alice' }],
    });

    const callArgs = create.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    if (!callArgs) {
      return;
    }

    expect(callArgs.data.suspensionUid).toBe('susp-1');
    expect(callArgs.data.identityId).toBe('identity-1');
    expect(callArgs.data.anonymizedUid).toBe('anon-1');
    expect(callArgs.data.tableName).toBe('Profile');
    expect(callArgs.data.backupSchemaVersion).toBe('1.0');
    expect(callArgs.data.backupUsed).toBe(false);
  });
});
