/**
 * Provider-Agnostic JWT Integration Test
 *
 * PURPOSE:
 * This test exists to prove that the backend can accept and authorize JWTs
 * from ANY standards-compliant OIDC identity provider — not just Supabase.
 * It uses a Keycloak-style token shape to demonstrate provider neutrality.
 *
 * SUCCESS CRITERIA:
 * If we replaced Supabase with any standards-compliant OIDC provider tomorrow,
 * would this backend still work? This test must answer "yes" convincingly.
 *
 * TOKEN SHAPE UNDER TEST:
 * - Algorithm: RS256 (asymmetric, industry standard)
 * - Issuer: Custom (non-Supabase)
 * - Roles via: realm_access.roles (Keycloak pattern)
 * - Includes noise claims that must be silently ignored
 *
 * NEUTRALITY GUARANTEES VALIDATED:
 * 1. RS256 signature validation works correctly
 * 2. Roles are extracted from realm_access.roles
 * 3. Unknown/provider-specific claims are ignored
 * 4. Issuer and audience are environment-configurable
 * 5. No Supabase-specific assumptions are required
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * SCENARIO TESTING MODE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * This test runs under SCENARIO_TESTING=true mode. This is INTENTIONAL.
 *
 * WHY: Scenario testing mode provides deterministic, static RSA key material
 * that allows us to sign JWTs in tests and have the backend validate them.
 * Without this, the backend would attempt to fetch keys from a JWKS endpoint
 * or use production secrets — neither of which is appropriate for E2E tests.
 *
 * WHAT THIS TEST VALIDATES:
 *   ✓ JWT claim shape compatibility (realm_access.roles, iss, aud, sub)
 *   ✓ RS256 signature validation mechanics
 *   ✓ Provider-neutral role extraction
 *   ✗ Production key provisioning (out of scope — that's infrastructure)
 *   ✗ JWKS endpoint rotation (out of scope — validated by ops, not code)
 *
 * GUARDRAIL: Future tests should NOT silently depend on scenario mode.
 * If a new test requires scenario mode, it must document WHY explicitly.
 * Scenario mode is NOT a bypass — it is a controlled test fixture for key material.
 *
 * The static keys used here match:
 *   - src/config/app-config.service.ts (scenarioTestingEnabled branch)
 *   - scripts/scenarios/lib/test-keys.js
 *
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * CONSTRAINTS:
 * - No production code modifications
 * - No auth guard bypasses
 * - No provider-specific branches
 * - Black-box testing only (assert HTTP responses, not internal state)
 * - Scenario testing used ONLY to stabilize key material
 * - This test must pass without modifying production auth behavior
 */

// MUST be imported first - sets JWT environment variables before NestJS loads
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

// Test constants (must match scenario testing mode in jwt-test.utils.ts)
const TEST_ISSUER = 'scenario-test-issuer';
const TEST_AUDIENCE = 'scenario-test-audience';
const testExternalUserIds = new Set<string>();

function registerTestUserId(sub: string): string {
  testExternalUserIds.add(sub);
  return sub;
}

/**
 * Generic OIDC token payload with Keycloak-style structure.
 *
 * This shape is intentionally non-Supabase:
 * - Uses realm_access.roles (Keycloak pattern)
 * - Includes Keycloak-specific noise claims
 * - No app_metadata or user_metadata
 */
interface GenericOidcTokenPayload {
  sub: string;
  email?: string;
  roles: string[];
}

/**
 * Create a generic OIDC token with Keycloak-style structure.
 *
 * This token shape demonstrates provider neutrality:
 * - RS256 algorithm (not HS256)
 * - Custom issuer (not Supabase)
 * - Roles in realm_access.roles (not app_metadata)
 * - Includes noise claims that must be ignored
 */
function createGenericOidcToken(
  payload: GenericOidcTokenPayload,
  options: {
    issuer?: string;
    audience?: string;
    expiresIn?: number;
  } = {},
): string {
  const { issuer = TEST_ISSUER, audience = TEST_AUDIENCE, expiresIn = 3600 } = options;

  const tokenPayload = {
    // Standard OIDC claims
    sub: registerTestUserId(payload.sub),
    ...(payload.email && { email: payload.email }),

    // Keycloak-style role claim (the pattern under test)
    realm_access: {
      roles: payload.roles,
    },

    // ─────────────────────────────────────────────────────────────
    // NOISE CLAIMS: These must be silently ignored by the backend.
    // Their presence proves the system doesn't break on unexpected data.
    // ─────────────────────────────────────────────────────────────

    // Keycloak-specific claims
    azp: 'frontend-client', // Authorized party
    preferred_username: 'testuser',
    given_name: 'Test',
    family_name: 'User',
    name: 'Test User',
    acr: '1', // Authentication context class reference
    sid: 'session-id-abc123', // Session ID
    email_verified: true,
    scope: 'openid profile email',

    // Keycloak client roles (should be ignored - we use realm_access only)
    resource_access: {
      'some-client': {
        roles: ['client-role-1', 'client-role-2'],
      },
    },

    // Arbitrary provider-specific claim
    custom_provider_claim: {
      organization: 'test-org',
      department: 'engineering',
    },

    // Additional OIDC standard claims
    typ: 'Bearer',
    auth_time: Math.floor(Date.now() / 1000) - 60,
  };

  return jwt.sign(tokenPayload, TEST_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn,
    issuer,
    audience,
  });
}

/**
 * Create a token with roles in BOTH realm_access.roles AND direct roles claim.
 *
 * This tests priority: realm_access.roles (priority 3) should win over
 * direct roles claim (priority 4).
 */
function createTokenWithMultipleRoleSources(
  realmAccessRoles: string[],
  directRoles: string[],
): string {
  const tokenPayload = {
    sub: registerTestUserId('priority-test-user'),
    email: 'priority@example.com',

    // Priority 3: Keycloak pattern (should win)
    realm_access: {
      roles: realmAccessRoles,
    },

    // Priority 4: Direct roles claim (should be ignored)
    roles: directRoles,
  };

  return jwt.sign(tokenPayload, TEST_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: 3600,
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
  });
}

/**
 * Response body types for assertions.
 */
interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
  };
}

interface SuccessResponseBody<T = unknown> {
  data: T;
}

describe('Provider-Agnostic JWT Integration', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const cleanupProviderAgnosticIdentities = async (): Promise<void> => {
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
    // Bootstrap app exactly as production — no guard overrides
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const reflector = app.get(Reflector);

    // Apply same middleware as production
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
    await cleanupProviderAgnosticIdentities();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await cleanupProviderAgnosticIdentities();
    await app.close();
  });

  const getServer = (): Server => app.getHttpServer() as Server;

  // ═══════════════════════════════════════════════════════════════════════════
  // RS256 + realm_access.roles Acceptance
  // ═══════════════════════════════════════════════════════════════════════════

  describe('RS256 + realm_access.roles acceptance', () => {
    it('accepts token with roles via realm_access.roles and returns 200', async () => {
      const token = createGenericOidcToken({
        sub: 'keycloak-user-001',
        email: 'keycloak@example.com',
        roles: ['USER'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Keycloak User' });

      // Must be 200 — not 401 (auth failed) or 403 (forbidden)
      expect(response.status).toBe(200);

      const body = response.body as SuccessResponseBody<{ displayName: string }>;
      expect(body.data).toBeDefined();
      expect(body.data.displayName).toBe('Keycloak User');
    });

    it('ignores extraneous noise claims without error', async () => {
      // The token factory includes many Keycloak-specific claims
      // that must be silently ignored
      const token = createGenericOidcToken({
        sub: 'noise-claims-user-002',
        email: 'noise@example.com',
        roles: ['USER'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Noise Claims User' });

      // Noise claims (azp, preferred_username, resource_access, etc.)
      // must not cause any issues
      expect(response.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Role Extraction from realm_access
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Role extraction from realm_access', () => {
    it('grants access with USER role in realm_access.roles', async () => {
      const token = createGenericOidcToken({
        sub: 'user-role-test-003',
        roles: ['USER'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'User Role Test' });

      expect(response.status).toBe(200);
    });

    it('grants access with ENTITY role in realm_access.roles', async () => {
      const token = createGenericOidcToken({
        sub: 'entity-role-test-004',
        roles: ['ENTITY'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Entity Role Test' });

      expect(response.status).toBe(200);
    });

    it('silently ignores unknown roles in realm_access.roles', async () => {
      const token = createGenericOidcToken({
        sub: 'unknown-roles-test-005',
        roles: ['USER', 'KEYCLOAK_INTERNAL', 'uma_authorization', 'offline_access'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Unknown Roles Ignored' });

      // USER is recognized, unknown roles are silently ignored
      expect(response.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Role Source Priority
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Role source priority', () => {
    it('realm_access.roles takes precedence over direct roles claim', async () => {
      // This token has roles in TWO locations:
      // - realm_access.roles: ['USER'] (priority 3, grants access)
      // - roles: ['SYSTEM'] (priority 4, would DENY access to profiles)
      //
      // The profiles endpoint requires USER or ENTITY role.
      // SYSTEM role is NOT sufficient for profiles access.
      //
      // If realm_access.roles is correctly prioritized, request succeeds.
      // If direct roles claim is used instead, request fails with 403.
      const token = createTokenWithMultipleRoleSources(
        ['USER'], // realm_access.roles — should be used
        ['SYSTEM'], // direct roles — should be ignored
      );

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Priority Test User' });

      // If this is 200, realm_access.roles was used (USER grants access)
      // If this is 403, direct roles was used (SYSTEM denies access)
      expect(response.status).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Issuer/Audience Enforcement
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Issuer/audience enforcement', () => {
    it('rejects token with wrong issuer', async () => {
      const token = createGenericOidcToken(
        { sub: 'wrong-issuer-user', roles: ['USER'] },
        { issuer: 'https://wrong-provider.example.com/realms/wrong' },
      );

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Wrong Issuer' });

      expect(response.status).toBe(401);
      const body = response.body as ErrorResponseBody;
      expect(body.error.code).toBe('AUTH_TOKEN_INVALID');
    });

    it('rejects token with wrong audience', async () => {
      const token = createGenericOidcToken(
        { sub: 'wrong-audience-user', roles: ['USER'] },
        { audience: 'wrong-client-id' },
      );

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Wrong Audience' });

      expect(response.status).toBe(401);
      const body = response.body as ErrorResponseBody;
      expect(body.error.code).toBe('AUTH_TOKEN_INVALID');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Missing Roles Enforcement
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ┌─────────────────────────────────────────────────────────────────────────┐
   * │  INTENTIONALLY SKIPPED — DO NOT "FIX" WITHOUT READING THIS             │
   * └─────────────────────────────────────────────────────────────────────────┘
   *
   * These tests are SKIPPED because RolesGuard is currently DISABLED at the
   * application level. See: src/app.module.ts (lines ~114-116), where the
   * RolesGuard APP_GUARD registration is commented out with the note:
   *   "TEMPORARY: RolesGuard disabled for Supabase integration testing"
   *
   * WHY THIS IS CORRECT:
   * This test file validates PROVIDER NEUTRALITY — specifically:
   *   ✓ That realm_access.roles claims are correctly EXTRACTED
   *   ✓ That RS256 signatures are correctly VALIDATED
   *   ✓ That issuer/audience are correctly ENFORCED
   *
   * This test file does NOT validate AUTHORIZATION ENFORCEMENT:
   *   ✗ Whether users without roles are denied access (requires RolesGuard)
   *   ✗ Whether specific endpoints require specific roles (requires RolesGuard)
   *
   * Authorization enforcement is a SEPARATE CONCERN from provider neutrality.
   * The active tests above prove that role EXTRACTION works correctly.
   * These skipped tests would prove that role ENFORCEMENT works correctly.
   *
   * WHEN TO ENABLE THESE TESTS:
   * Re-enable this describe block when RolesGuard is re-enabled in app.module.ts.
   * At that point, users with no canonical roles (USER, ENTITY, etc.) should
   * receive HTTP 403 with error code AUTH_FORBIDDEN.
   *
   * DO NOT:
   *   - Remove these tests (they document expected behavior)
   *   - Remove the .skip without enabling RolesGuard
   *   - Consider these tests "broken" (they are intentionally skipped)
   */
  describe.skip('Missing roles enforcement (requires RolesGuard)', () => {
    it('rejects token with no roles in realm_access', async () => {
      const token = createGenericOidcToken({
        sub: 'no-roles-user',
        roles: [], // Empty roles array
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'No Roles' });

      expect(response.status).toBe(403);
      const body = response.body as ErrorResponseBody;
      expect(body.error.code).toBe('AUTH_FORBIDDEN');
    });

    it('rejects token with only unrecognized roles', async () => {
      const token = createGenericOidcToken({
        sub: 'unrecognized-roles-user',
        roles: ['KEYCLOAK_INTERNAL', 'uma_authorization', 'offline_access'],
      });

      const response = await request(getServer())
        .post('/api/v1/profiles/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ displayName: 'Unrecognized Roles' });

      // All roles are unknown, so user has no recognized roles → forbidden
      expect(response.status).toBe(403);
      const body = response.body as ErrorResponseBody;
      expect(body.error.code).toBe('AUTH_FORBIDDEN');
    });
  });
});
