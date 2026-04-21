/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import './setup-auth';
import { TEST_PRIVATE_KEY } from './setup-auth';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { Identity } from '@prisma/client';

const TEST_ISSUER = 'scenario-test-issuer';
const TEST_AUDIENCE = 'scenario-test-audience';

function createUserToken(sub: string): string {
  return jwt.sign(
    {
      sub,
      realm_access: { roles: ['USER'] },
    },
    TEST_PRIVATE_KEY,
    {
      algorithm: 'RS256',
      expiresIn: 3600,
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
    },
  );
}

describe('GDPR Recovery Access Control', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  const pendingRecoveryUserId = 'user-pending-recovery-' + Date.now();
  const activeUserId = 'user-active-' + Date.now();
  const deletedUserId = 'user-deleted-' + Date.now();

  let pendingRecoveryUserToken: string;
  let activeUserToken: string;
  let deletedUserToken: string;

  const cleanupRecoveryTestIdentities = async (): Promise<void> => {
    await prisma.identity.deleteMany({
      where: {
        externalUserId: {
          in: [pendingRecoveryUserId, activeUserId, deletedUserId],
        },
      },
    });
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    await cleanupRecoveryTestIdentities();
    server = app.getHttpServer();

    pendingRecoveryUserToken = createUserToken(pendingRecoveryUserId);
    activeUserToken = createUserToken(activeUserId);
    deletedUserToken = createUserToken(deletedUserId);
  });

  afterAll(async () => {
    await cleanupRecoveryTestIdentities();
    await app.close();
  });

  /**
   * Helper to create a PENDING_RECOVERY identity.
   * Encapsulates implementation details:
   * 1. Identity must be isSuspended = true
   * 2. Must have valid AccountSuspension with backups
   * 3. Must be within recovery window (not expired)
   */
  async function createPendingRecoveryIdentity(externalUserId: string): Promise<Identity> {
    // 1. Create Identity (Suspended)
    const identity = await prisma.identity.create({
      data: { externalUserId: externalUserId, isSuspended: true, anonymized: false },
    });

    // 2. Create Valid Suspension (Recovery Available)
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const suspensionUid = `susp-${identity.id}`;
    const anonymizedUid = `anon-${identity.id}`;

    await prisma.accountSuspension.create({
      data: {
        identityId: identity.id,
        suspensionUid,
        anonymizedUid,
        suspendedAt: new Date(),
        lifecycleState: 'SUSPENDED',
        suspendedUntil: future,
        backups: {
          create: [
            {
              identityId: identity.id,
              anonymizedUid,
              tableName: 'profiles',
              backupData: {},
              backupUsed: false,
            },
          ],
        },
      },
    });
    return identity;
  }

  it('Setup: Create identities', async () => {
    // 1. Create Active User (Normal)
    await prisma.identity.create({
      data: { externalUserId: activeUserId, isSuspended: false, anonymized: false },
    });

    // 2. Create PENDING_RECOVERY User (via helper)
    await createPendingRecoveryIdentity(pendingRecoveryUserId);

    // 3. Create DELETED User (Anonymized)
    await prisma.identity.create({
      data: {
        externalUserId: deletedUserId,
        isSuspended: false,
        anonymized: true,
        deletedAt: new Date(),
      },
    });
  });

  describe('POST /api/v1/gdpr/recover', () => {
    // IMPORTANT: This test MUST run FIRST because the recovery test mutates
    // isSuspended to false, breaking subsequent suspended-user tests
    it('should BLOCK PENDING_RECOVERY user from OTHER endpoints', async () => {
      // A PENDING_RECOVERY user is technically suspended from normal access.
      // They should ONLY be allowed to access endpoints marked @AllowPendingRecovery

      const response = await request(server)
        .post('/api/v1/gdpr/export')
        .set('Authorization', `Bearer ${pendingRecoveryUserToken}`);

      expect(response.status).toBe(403);
      // IdentityStatusGuard blocks generic access for isSuspended=true users
      expect((response.body as { code: string }).code).toBe('IDENTITY_SUSPENDED');
    });

    it('should ALLOW PENDING_RECOVERY user', async () => {
      // Expect 200 OK
      // NOTE: This test MUTATES identity.isSuspended to false (via resumeIdentity)
      await request(server)
        .post('/api/v1/gdpr/recover')
        .set('Authorization', `Bearer ${pendingRecoveryUserToken}`)
        .expect(200);
    });

    it('should BLOCK ACTIVE user', async () => {
      const response = await request(server)
        .post('/api/v1/gdpr/recover')
        .set('Authorization', `Bearer ${activeUserToken}`);

      expect(response.status).toBe(403);
      expect((response.body as { code: string }).code).toBe('IDENTITY_NOT_SUSPENDED');
    });

    it('should BLOCK DELETED user', async () => {
      const response = await request(server)
        .post('/api/v1/gdpr/recover')
        .set('Authorization', `Bearer ${deletedUserToken}`);

      expect(response.status).toBe(403);
      expect((response.body as { code: string }).code).toBe('IDENTITY_DELETED');
    });
  });
});
