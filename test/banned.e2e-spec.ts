/*
 * RATCHET: Legacy ESLint violations.
 * These disables exist only for pre-existing code.
 * New code in this file MUST NOT introduce new violations.
 * Fix opportunistically when touching this file.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
/**
 * BANNED Identity Status E2E Tests.
 *
 * Tests that BANNED users:
 * 1. Are blocked at bootstrap (returns status: BANNED)
 * 2. Are blocked at all protected endpoints (403)
 * 3. Cannot regain access by re-authenticating
 * 4. Do not affect ACTIVE user access
 *
 * IMPORTANT: The setup-auth module MUST be imported first to set
 * environment variables before any NestJS modules are loaded.
 */

// MUST be imported first - sets environment variables
import { TEST_PRIVATE_KEY } from './setup-auth';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import type { Server } from 'http';
import * as jwt from 'jsonwebtoken';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseTransformInterceptor } from '../src/common/interceptors/response-transform.interceptor';
import { PrismaService } from '../src/common/prisma/prisma.service';

// Test constants (must match setup-auth.ts)
const TEST_ISSUER = 'scenario-test-issuer';
const TEST_AUDIENCE = 'scenario-test-audience';

/**
 * Create a test JWT token with USER role.
 */
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

describe('BANNED Identity Status E2E Tests', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  // Test user IDs
  const bannedUserId = 'banned-test-user-' + Date.now();
  const activeUserId = 'active-test-user-' + Date.now();

  let bannedUserToken: string;
  let activeUserToken: string;

  // Created resources for cleanup
  let bannedIdentityId: string | null = null;
  let activeIdentityId: string | null = null;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply global pipes
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // Apply global filters and interceptors
    const reflector = app.get(Reflector);
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseTransformInterceptor(reflector));

    // Set global prefix (matching main.ts)
    app.setGlobalPrefix('api');

    await app.init();
    server = app.getHttpServer();

    // Get prisma for setup/cleanup
    prisma = app.get(PrismaService);

    // Create tokens
    bannedUserToken = createUserToken(bannedUserId);
    activeUserToken = createUserToken(activeUserId);

    // Pre-create banned user identity
    const bannedIdentity = await prisma.identity.create({
      data: {
        externalUserId: bannedUserId,
        isBanned: true,
      },
    });
    bannedIdentityId = bannedIdentity.id;

    // Pre-create active user identity (for comparison)
    const activeIdentity = await prisma.identity.create({
      data: {
        externalUserId: activeUserId,
        isBanned: false,
      },
    });
    activeIdentityId = activeIdentity.id;
  });

  afterAll(async () => {
    // Clean up test data
    try {
      if (bannedIdentityId) {
        await prisma.identity.delete({ where: { id: bannedIdentityId } });
      }
      if (activeIdentityId) {
        await prisma.identity.delete({ where: { id: activeIdentityId } });
      }
    } catch (e) {
      console.error('Cleanup error:', e);
    }

    await app.close();
  });

  describe('POST /api/v1/bootstrap (Authenticated)', () => {
    it('should return status BANNED for banned user', async () => {
      const response = await request(server)
        .post('/api/v1/bootstrap')
        .set('Authorization', `Bearer ${bannedUserToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.identity).toBeDefined();
      expect(response.body.data.identity.status).toBe('BANNED');
      // BANNED should NOT have recoveryAvailable
      expect(response.body.data.identity.recoveryAvailable).toBeUndefined();
    });

    it('should return status ACTIVE for active user', async () => {
      const response = await request(server)
        .post('/api/v1/bootstrap')
        .set('Authorization', `Bearer ${activeUserToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.identity).toBeDefined();
      expect(response.body.data.identity.status).toBe('ACTIVE');
    });
  });

  describe('Protected Endpoints Blocking', () => {
    it('should block banned user from profile endpoints', async () => {
      const response = await request(server)
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${bannedUserToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
    });

    it('should allow active user to access profile endpoints', async () => {
      const response = await request(server)
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${activeUserToken}`);

      // 404 is expected (profile not created), but NOT 403
      expect(response.status).not.toBe(403);
    });

    it('should block banned user from GDPR endpoints', async () => {
      const response = await request(server)
        .post('/api/v1/gdpr/export')
        .set('Authorization', `Bearer ${bannedUserToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('AUTH_FORBIDDEN');
    });
  });

  describe('Re-authentication Does Not Restore Access', () => {
    it('should still block after generating new token', async () => {
      // Generate a new token for the same banned user
      const newToken = createUserToken(bannedUserId);

      const response = await request(server)
        .post('/api/v1/bootstrap')
        .set('Authorization', `Bearer ${newToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.identity.status).toBe('BANNED');
    });
  });
});
