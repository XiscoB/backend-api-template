/*
 * RATCHET: Legacy ESLint violations.
 * These disables exist only for pre-existing code.
 * New code in this file MUST NOT introduce new violations.
 * Fix opportunistically when touching this file.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
/**
 * GDPR E2E Tests (Phase 6).
 *
 * Tests the complete GDPR export lifecycle:
 * 1. Request initiation
 * 2. Background processing
 * 3. Secure download
 * 4. Expiry enforcement
 * 5. Cleanup
 *
 * These tests use test storage adapters (no real AWS).
 * They verify behavior contracts, not implementation details.
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
function createUserToken(sub: string, email?: string): string {
  return jwt.sign(
    {
      sub,
      email,
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

/**
 * Create a test JWT token with ADMIN role.
 */
function createAdminToken(sub: string): string {
  return jwt.sign(
    {
      sub,
      app_metadata: {
        internal_admin: true,
        internal_admin_level: 'read',
      },
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

/**
 * Create a different user's token (for access control tests).
 */
function createOtherUserToken(): string {
  return jwt.sign(
    {
      sub: 'other-user-id-12345',
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

describe('GDPR E2E Tests', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  // Test user credentials
  const testUserId = 'gdpr-test-user-' + Date.now();
  const testUserEmail = 'gdpr-test@example.com';
  const otherUserId = 'other-user-id-12345';
  const adminSub = process.env.ADMIN_USER_IDS?.split(',')[0]?.trim() || 'admin-user-id';
  let testUserToken: string;
  let adminToken: string;
  let otherUserToken: string;

  // Created resources to clean up
  let createdIdentityId: string | null = null;
  let createdRequestId: string | null = null;

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

    // Get prisma for cleanup
    prisma = app.get(PrismaService);

    // Create tokens
    testUserToken = createUserToken(testUserId, testUserEmail);
    adminToken = createAdminToken(adminSub);
    otherUserToken = createOtherUserToken();

    // Ensure ownership checks evaluate to 403 (owner mismatch) instead of 404 (identity missing).
    await prisma.identity.upsert({
      where: { externalUserId: otherUserId },
      update: {},
      create: { externalUserId: otherUserId },
    });
  });

  afterAll(async () => {
    // Clean up test data
    try {
      if (createdRequestId) {
        await prisma.request.deleteMany({
          where: { id: createdRequestId },
        });
      }
      if (createdIdentityId) {
        // Delete audit logs first (foreign key constraint)
        await prisma.gdprAuditLog.deleteMany({
          where: { identityId: createdIdentityId },
        });
        // Delete profile
        await prisma.profile.deleteMany({
          where: { identityId: createdIdentityId },
        });
        // Delete identity
        await prisma.identity.deleteMany({
          where: { id: createdIdentityId },
        });
      }

      await prisma.identity.deleteMany({
        where: { externalUserId: otherUserId },
      });
    } catch (e) {
      console.error('Cleanup error:', e);
    }

    await app.close();
  });

  describe('POST /api/v1/gdpr/export (contract replacement for removed my-data endpoint)', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(server).post('/api/v1/gdpr/export');

      expect(response.status).toBe(401);
    });

    it('should accept export request for authenticated user', async () => {
      const response = await request(server)
        .post('/api/v1/gdpr/export')
        .set('Authorization', `Bearer ${testUserToken}`);

      expect(response.status).toBe(202);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.requestType).toBe('GDPR_EXPORT');

      // Remove this request so canonical export flow below can create its own pending request.
      await prisma.request.deleteMany({
        where: { id: response.body.data.id as string },
      });
    });
  });

  describe('POST /api/v1/gdpr/request-export', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(server).post('/api/v1/gdpr/export');

      expect(response.status).toBe(401);
    });

    it('should create an export request for authenticated user', async () => {
      const response = await request(server)
        .post('/api/v1/gdpr/export')
        .set('Authorization', `Bearer ${testUserToken}`);

      expect(response.status).toBe(202);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.requestType).toBe('GDPR_EXPORT');
      expect(response.body.data.status).toBe('PENDING');

      // Store request ID for subsequent tests
      createdRequestId = response.body.data.id as string;

      const identity = await prisma.identity.findUnique({
        where: { externalUserId: testUserId },
      });
      createdIdentityId = identity?.id ?? null;
    });
  });

  describe('GET /api/v1/gdpr/export-status/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(server).get(`/api/v1/gdpr/exports/${createdRequestId}`);

      expect(response.status).toBe(401);
    });

    it('should return status for own request', async () => {
      const response = await request(server)
        .get(`/api/v1/gdpr/exports/${createdRequestId}`)
        .set('Authorization', `Bearer ${testUserToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.requestId).toBe(createdRequestId);
      expect(['PENDING', 'PROCESSING', 'COMPLETED']).toContain(response.body.data.status);
    });

    it('should return 403 for other user request', async () => {
      const response = await request(server)
        .get(`/api/v1/gdpr/exports/${createdRequestId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 for non-existent request', async () => {
      const response = await request(server)
        .get('/api/v1/gdpr/exports/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${testUserToken}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/v1/gdpr/download/:id', () => {
    it('should return 401 without authentication', async () => {
      const response = await request(server).get(
        `/api/v1/gdpr/exports/${createdRequestId}/download`,
      );

      expect(response.status).toBe(401);
    });

    it('should return 403 for other user export', async () => {
      const response = await request(server)
        .get(`/api/v1/gdpr/exports/${createdRequestId}/download`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(response.status).toBe(403);
    });

    it('should return appropriate status for pending export', async () => {
      const response = await request(server)
        .get(`/api/v1/gdpr/exports/${createdRequestId}/download`)
        .set('Authorization', `Bearer ${testUserToken}`);

      // Export is likely still PENDING, so should get 404 with NOT_READY
      // If somehow completed quickly, would get 200 with download URL
      expect([200, 404]).toContain(response.status);
    });
  });

  describe('Admin GDPR Endpoints', () => {
    describe('GET /api/internal/gdpr/requests', () => {
      it('should return 401 without authentication', async () => {
        const response = await request(server).get('/api/internal/gdpr/requests');

        expect(response.status).toBe(401);
      });

      it('should return 403 for non-admin user', async () => {
        const response = await request(server)
          .get('/api/internal/gdpr/requests')
          .set('Authorization', `Bearer ${testUserToken}`);

        expect(response.status).toBe(403);
      });

      it('should return request list for admin', async () => {
        const response = await request(server)
          .get('/api/internal/gdpr/requests')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.meta).toBeDefined();
        expect(response.body.meta.total).toBeGreaterThanOrEqual(0);
      });

      it('should filter by requestType', async () => {
        const response = await request(server)
          .get('/api/internal/gdpr/requests?requestType=GDPR_EXPORT')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        // All returned requests should be GDPR_EXPORT
        for (const req of response.body.data) {
          expect(req.requestType).toBe('GDPR_EXPORT');
        }
      });

      it('should filter by status', async () => {
        const response = await request(server)
          .get('/api/internal/gdpr/requests?status=PENDING')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        // All returned requests should be PENDING
        for (const req of response.body.data) {
          expect(req.status).toBe('PENDING');
        }
      });

      it('should support pagination', async () => {
        const response = await request(server)
          .get('/api/internal/gdpr/requests?limit=5&offset=0')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data.length).toBeLessThanOrEqual(5);
        expect(response.body.meta.limit).toBe(5);
        expect(response.body.meta.offset).toBe(0);
      });
    });

    describe('GET /api/internal/gdpr/requests/:id', () => {
      it('should return 403 for non-admin user', async () => {
        const response = await request(server)
          .get(`/api/internal/gdpr/requests/${createdRequestId}`)
          .set('Authorization', `Bearer ${testUserToken}`);

        expect(response.status).toBe(403);
      });

      it('should return request details for admin', async () => {
        const response = await request(server)
          .get(`/api/internal/gdpr/requests/${createdRequestId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.id).toBe(createdRequestId);
        expect(response.body.data.requestType).toBe('GDPR_EXPORT');
        // Sensitive fields should NOT be present
        expect(response.body.data.storageKey).toBeUndefined();
        expect(response.body.data.dataPayload).toBeUndefined();
      });

      it('should return 404 for non-existent request', async () => {
        const response = await request(server)
          .get('/api/internal/gdpr/requests/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(404);
      });
    });

    describe('GET /api/internal/gdpr/metrics', () => {
      it('should return 403 for non-admin user', async () => {
        const response = await request(server)
          .get('/api/internal/gdpr/metrics')
          .set('Authorization', `Bearer ${testUserToken}`);

        expect(response.status).toBe(403);
      });

      it('should return metrics for admin', async () => {
        const response = await request(server)
          .get('/api/internal/gdpr/metrics')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.totalRequests).toBeGreaterThanOrEqual(0);
        expect(response.body.data.byType).toBeDefined();
        expect(response.body.data.byStatus).toBeDefined();
        expect(response.body.data.pendingExports).toBeGreaterThanOrEqual(0);
        expect(response.body.data.totalDownloads).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Security Contracts', () => {
    it('should not expose storage keys in admin responses', async () => {
      const response = await request(server)
        .get(`/api/internal/gdpr/requests/${createdRequestId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      // Storage key should never be exposed
      const data = response.body.data;
      expect(data.storageKey).toBeUndefined();
      expect(data.dataPayload).toBeUndefined();
      // But hasExportData flag should indicate if export exists
      expect(typeof data.hasExportData).toBe('boolean');
    });

    it('should enforce strict ownership for downloads', async () => {
      // Create a request ID that belongs to another user
      // Then try to download it - should be rejected
      const response = await request(server)
        .get(`/api/v1/gdpr/exports/${createdRequestId}/download`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      expect(response.status).toBe(403);
    });
  });
});
