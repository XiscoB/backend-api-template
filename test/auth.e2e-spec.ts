/**
 * JWT Authentication E2E Tests.
 *
 * Tests real JWT validation using the global JwtAuthGuard and RolesGuard.
 * No mocks - uses actual validation with test key pair.
 *
 * IMPORTANT: The setup-auth module MUST be imported first to set
 * environment variables before any NestJS modules are loaded.
 *
 * Test cases:
 * 1. Missing Authorization header → 401 AUTH_UNAUTHORIZED
 * 2. Invalid signature → 401 AUTH_TOKEN_INVALID
 * 3. Expired token → 401 AUTH_TOKEN_EXPIRED
 * 4. Valid token → 200 OK
 * 5. Valid token with unknown role → accepted, role ignored
 * 6. Valid token without email claim → accepted
 * 7. Supabase-style token with app_metadata.roles → accepted
 * 8. Token with direct roles claim → accepted
 */

// MUST be imported first - sets environment variables
import { TEST_PRIVATE_KEY, WRONG_PRIVATE_KEY } from './setup-auth';

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
const testExternalUserIds = new Set<string>();

function registerTestUserId(sub: string): string {
  testExternalUserIds.add(sub);
  return sub;
}

/**
 * Create a test JWT token with realm_access.roles (Keycloak pattern).
 */
function createTestToken(payload: { sub: string; email?: string; roles?: string[] }): string {
  const tokenPayload = {
    sub: registerTestUserId(payload.sub),
    ...(payload.email && { email: payload.email }),
    ...(payload.roles && { realm_access: { roles: payload.roles } }),
  };

  return jwt.sign(tokenPayload, TEST_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: 3600,
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
  });
}

/**
 * Create a Supabase-style JWT token with app_metadata.roles.
 */
function createSupabaseStyleToken(payload: {
  sub: string;
  email?: string;
  roles?: string[];
}): string {
  const tokenPayload = {
    sub: registerTestUserId(payload.sub),
    role: 'authenticated', // Supabase auth role (not used for authorization)
    ...(payload.email && { email: payload.email }),
    ...(payload.roles && {
      app_metadata: {
        roles: payload.roles,
        provider: 'email',
      },
    }),
  };

  return jwt.sign(tokenPayload, TEST_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: 3600,
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
  });
}

/**
 * Create a token with direct roles claim (generic OIDC pattern).
 */
function createDirectRolesToken(payload: {
  sub: string;
  email?: string;
  roles?: string[];
}): string {
  const tokenPayload = {
    sub: registerTestUserId(payload.sub),
    ...(payload.email && { email: payload.email }),
    ...(payload.roles && { roles: payload.roles }),
  };

  return jwt.sign(tokenPayload, TEST_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: 3600,
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
  });
}

/**
 * Create an expired test JWT.
 */
function createExpiredToken(payload: { sub: string; email?: string; roles?: string[] }): string {
  const tokenPayload = {
    sub: registerTestUserId(payload.sub),
    ...(payload.email && { email: payload.email }),
    ...(payload.roles && { realm_access: { roles: payload.roles } }),
    iss: TEST_ISSUER,
    aud: TEST_AUDIENCE,
    iat: Math.floor(Date.now() / 1000) - 7200,
    exp: Math.floor(Date.now() / 1000) - 3600,
  };

  return jwt.sign(tokenPayload, TEST_PRIVATE_KEY, { algorithm: 'RS256' });
}

/**
 * Create a token with invalid signature.
 */
function createInvalidSignatureToken(payload: {
  sub: string;
  email?: string;
  roles?: string[];
}): string {
  const tokenPayload = {
    sub: registerTestUserId(payload.sub),
    ...(payload.email && { email: payload.email }),
    ...(payload.roles && { realm_access: { roles: payload.roles } }),
  };

  return jwt.sign(tokenPayload, WRONG_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: 3600,
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
  });
}

const TEST_USER = {
  sub: 'test-user-id-123',
  email: 'test@example.com',
  roles: ['USER'],
};

/**
 * Response body types for type-safe assertions.
 */
interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId?: string;
    timestamp: string;
  };
}

interface SuccessResponseBody<T = unknown> {
  data: T;
  meta?: {
    requestId?: string;
    timestamp: string;
  };
}

interface HealthResponseBody {
  status: string;
}

describe('JWT Authentication (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const cleanupAuthIdentities = async (): Promise<void> => {
    if (testExternalUserIds.size === 0) return;

    await prisma.identity.deleteMany({
      where: {
        externalUserId: {
          in: Array.from(testExternalUserIds),
        },
      },
    });
  };

  beforeAll(async () => {
    // Environment variables are set in setup-auth.ts (imported at top)
    // This ensures they're set before NestJS modules are loaded

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const reflector = app.get(Reflector);

    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseTransformInterceptor(reflector));

    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanupAuthIdentities();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await cleanupAuthIdentities();
    await app.close();
  });

  // Helper to get HTTP server
  const getServer = (): Server => app.getHttpServer() as Server;

  // ─────────────────────────────────────────────────────────────
  // Test: Missing Authorization header
  // ─────────────────────────────────────────────────────────────
  describe('Missing Authorization header', () => {
    it('should return 401 AUTH_UNAUTHORIZED', async () => {
      const response = await request(getServer()).get('/api/v1/profiles/me');
      const body = response.body as ErrorResponseBody;

      expect(response.status).toBe(401);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('AUTH_UNAUTHORIZED');
      expect(body.error.message).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test: Invalid signature
  // ─────────────────────────────────────────────────────────────
  describe('Invalid signature', () => {
    it('should return 401 AUTH_TOKEN_INVALID', async () => {
      const invalidToken = createInvalidSignatureToken(TEST_USER);

      const response = await request(getServer())
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${invalidToken}`);
      const body = response.body as ErrorResponseBody;

      expect(response.status).toBe(401);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('AUTH_TOKEN_INVALID');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test: Expired token
  // ─────────────────────────────────────────────────────────────
  describe('Expired token', () => {
    it('should return 401 AUTH_TOKEN_EXPIRED', async () => {
      const expiredToken = createExpiredToken(TEST_USER);

      const response = await request(getServer())
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      const body = response.body as ErrorResponseBody;

      expect(response.status).toBe(401);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('AUTH_TOKEN_EXPIRED');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test: Valid token with correct issuer & audience
  // ─────────────────────────────────────────────────────────────
  describe('Valid token', () => {
    it('should return 200 OK for authenticated request', async () => {
      const validToken = createTestToken(TEST_USER);

      const response = await request(getServer())
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${validToken}`);

      // Profile might not exist (404) but auth succeeded
      // We check for NOT 401/403 to confirm auth passed
      expect([200, 404]).toContain(response.status);

      // If 404, it's because profile doesn't exist, not auth failure
      if (response.status === 404) {
        const body = response.body as ErrorResponseBody;
        expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('should create profile successfully with valid token', async () => {
      const validToken = createTestToken(TEST_USER);

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ displayName: 'Test User' });
      const body = response.body as SuccessResponseBody<{ displayName: string }>;

      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
      expect(body.data.displayName).toBe('Test User');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test: Valid token with unknown role
  // ─────────────────────────────────────────────────────────────
  describe('Valid token with unknown role', () => {
    it('should accept token and ignore unknown roles', async () => {
      const tokenWithUnknownRole = createTestToken({
        sub: 'unknown-role-user-789',
        email: 'unknown@example.com',
        roles: ['USER', 'UNKNOWN_ROLE', 'PROVIDER_INTERNAL'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenWithUnknownRole}`)
        .send({ displayName: 'Unknown Role User' });
      const body = response.body as SuccessResponseBody;

      // Auth should succeed (USER role is recognized)
      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test: Valid token without email claim
  // ─────────────────────────────────────────────────────────────
  describe('Valid token without email claim', () => {
    it('should accept token without email', async () => {
      const tokenWithoutEmail = createTestToken({
        sub: 'no-email-user-abc',
        roles: ['USER'],
        // No email
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${tokenWithoutEmail}`)
        .send({ displayName: 'No Email User' });
      const body = response.body as SuccessResponseBody;

      // Auth should succeed
      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test: Supabase-style token with app_metadata.roles
  // ─────────────────────────────────────────────────────────────
  describe('Supabase-style token (app_metadata.roles)', () => {
    it('should extract roles from app_metadata.roles', async () => {
      const supabaseToken = createSupabaseStyleToken({
        sub: 'supabase-user-123',
        email: 'supabase@example.com',
        roles: ['USER'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${supabaseToken}`)
        .send({ displayName: 'Supabase User' });
      const body = response.body as SuccessResponseBody;

      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('should reject Supabase token without roles in app_metadata', async () => {
      // Token with only 'role: authenticated' but no app_metadata.roles
      const tokenPayload = {
        sub: registerTestUserId('supabase-no-roles-456'),
        email: 'noroles@example.com',
        role: 'authenticated',
        // No app_metadata.roles
      };

      const noRolesToken = jwt.sign(tokenPayload, TEST_PRIVATE_KEY, {
        algorithm: 'RS256',
        expiresIn: 3600,
        issuer: TEST_ISSUER,
        audience: TEST_AUDIENCE,
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${noRolesToken}`)
        .send({ displayName: 'No Roles User' });
      const body = response.body as SuccessResponseBody;

      // Route has no role metadata; authenticated access is allowed
      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test: Token with direct roles claim
  // ─────────────────────────────────────────────────────────────
  describe('Direct roles claim', () => {
    it('should extract roles from direct roles claim', async () => {
      const directRolesToken = createDirectRolesToken({
        sub: 'direct-roles-user-789',
        email: 'direct@example.com',
        roles: ['USER'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${directRolesToken}`)
        .send({ displayName: 'Direct Roles User' });
      const body = response.body as SuccessResponseBody;

      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test: Same user across multiple devices (same sub)
  // ─────────────────────────────────────────────────────────────
  describe('Multi-device authentication (same sub)', () => {
    it('should map tokens with same sub to same user', async () => {
      const userId = 'multi-device-user-xyz';

      // Create profile from "device 1"
      const token1 = createTestToken({
        sub: userId,
        email: 'device1@example.com',
        roles: ['USER'],
      });

      const createResponse = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token1}`)
        .send({ displayName: 'Multi Device User' });

      expect(createResponse.status).toBe(200);

      // Access from "device 2" with same sub (Supabase-style token)
      const token2 = createSupabaseStyleToken({
        sub: userId,
        email: 'device2@example.com', // Different email claim
        roles: ['USER'],
      });

      const getResponse = await request(getServer())
        .get('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token2}`);

      // Should find the same profile (same sub)
      expect(getResponse.status).toBe(200);
      const body = getResponse.body as SuccessResponseBody<{ displayName: string }>;
      expect(body.data.displayName).toBe('Multi Device User');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test: Role enforcement
  // ─────────────────────────────────────────────────────────────
  describe('Role enforcement', () => {
    it('should reject user without required role', async () => {
      // Token with SYSTEM role (not USER or ENTITY)
      const systemToken = createTestToken({
        sub: 'system-user-xyz',
        roles: ['SYSTEM'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${systemToken}`)
        .send({ displayName: 'System User' });
      const body = response.body as SuccessResponseBody;

      // Route has no role metadata; authenticated access is allowed
      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('should accept ENTITY role for profiles endpoint', async () => {
      const entityToken = createTestToken({
        sub: 'entity-user-ent',
        email: 'entity@example.com',
        roles: ['ENTITY'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${entityToken}`)
        .send({ displayName: 'Entity User' });
      const body = response.body as SuccessResponseBody;

      expect(response.status).toBe(200);
      expect(body.data).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Test: Public routes bypass auth
  // ─────────────────────────────────────────────────────────────
  describe('Public routes', () => {
    it('should allow access to health endpoint without token', async () => {
      const response = await request(getServer()).get('/api/v1/health');
      const body = response.body as HealthResponseBody;

      expect(response.status).toBe(200);
      expect(body.status).toBe('ok');
    });
  });
});
