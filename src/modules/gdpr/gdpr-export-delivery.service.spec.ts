import { Identity } from '@prisma/client';
import { IdentityService } from '../identity/identity.service';
import { GdprExportDeliveryService } from './gdpr-export-delivery.service';
import { GdprS3StorageAdapter } from './gdpr-s3-storage.adapter';

type RequestRecord = {
  id: string;
  identityId: string;
  requestType: 'GDPR_EXPORT' | 'OTHER';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  dataPayload: unknown;
  expiresAt: Date | null;
  processedAt: Date | null;
  errorMessage?: string | null;
  createdAt?: Date;
};

type PrismaMock = {
  request: {
    findUnique: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
  };
  gdprAuditLog: {
    create: jest.Mock;
  };
};

type IdentityServiceMock = {
  getIdentityByExternalUserId: jest.MockedFunction<IdentityService['getIdentityByExternalUserId']>;
};

const createIdentity = (overrides?: Partial<Identity>): Identity => ({
  id: 'identity-owner-1',
  externalUserId: 'jwt-sub-owner-1',
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

describe('GdprExportDeliveryService', () => {
  let service: GdprExportDeliveryService;
  let prisma: PrismaMock;
  let identityService: IdentityServiceMock;
  let s3Storage: Pick<GdprS3StorageAdapter, 'generatePresignedUrl' | 'delete'>;

  beforeEach(() => {
    prisma = {
      request: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      gdprAuditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };

    identityService = {
      getIdentityByExternalUserId: jest.fn(),
    };

    s3Storage = {
      generatePresignedUrl: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
    };

    service = new GdprExportDeliveryService(
      prisma as never,
      s3Storage as GdprS3StorageAdapter,
      identityService as never,
    );
  });

  it('fails closed when requester identity cannot be resolved', async () => {
    identityService.getIdentityByExternalUserId.mockResolvedValue(null);

    const result = await service.authorizeDownload('req-1', 'missing-sub');

    expect(result).toEqual({
      authorized: false,
      errorCode: 'FORBIDDEN',
      errorMessage: 'User identity not found',
    });
    expect(prisma.request.findUnique).not.toHaveBeenCalled();
  });

  it('enforces ownership strictly and rejects cross-identity access attempts', async () => {
    // Architectural invariant: ownership is identity-rooted and cannot be bypassed.
    identityService.getIdentityByExternalUserId.mockResolvedValue(
      createIdentity({ id: 'identity-requester-flagged', isFlagged: true }),
    );

    const record: RequestRecord = {
      id: 'req-2',
      identityId: 'identity-owner-real',
      requestType: 'GDPR_EXPORT',
      status: 'COMPLETED',
      dataPayload: {},
      expiresAt: new Date('2026-02-21T00:00:00.000Z'),
      processedAt: new Date('2026-02-20T00:00:00.000Z'),
    };
    prisma.request.findUnique.mockResolvedValue(record);

    const result = await service.authorizeDownload('req-2', 'jwt-sub-requester');

    expect(result.authorized).toBe(false);
    expect(result.errorCode).toBe('FORBIDDEN');
    expect(result.errorMessage).toMatch(/do not have access/i);
  });

  it('returns explicit EXPIRED result and does not leak download URL after expiry', async () => {
    identityService.getIdentityByExternalUserId.mockResolvedValue(
      createIdentity({ id: 'identity-3' }),
    );
    prisma.request.findUnique.mockResolvedValue({
      id: 'req-3',
      identityId: 'identity-3',
      requestType: 'GDPR_EXPORT',
      status: 'COMPLETED',
      dataPayload: {
        storageKey: 'gdpr/exports/r3.zip',
        filename: 'gdpr-export-r3.zip',
        fileSize: 1024,
        generatedAt: '2026-02-18T00:00:00.000Z',
        expiresAt: '2026-02-19T00:00:00.000Z',
        schemaVersion: '1.0.0',
        language: 'en',
      },
      expiresAt: new Date('2026-02-19T00:00:00.000Z'),
      processedAt: new Date('2026-02-18T00:00:00.000Z'),
    });

    const result = await service.authorizeDownload('req-3', 'jwt-sub-owner');

    expect(result).toEqual({
      authorized: false,
      errorCode: 'EXPIRED',
      errorMessage: 'Export has expired and is no longer available',
    });
    expect(s3Storage.generatePresignedUrl).not.toHaveBeenCalled();
  });
});
