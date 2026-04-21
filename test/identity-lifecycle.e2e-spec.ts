/*
 * RATCHET: Legacy ESLint violations.
 * These disables exist only for pre-existing code.
 * New code in this file MUST NOT introduce new violations.
 * Fix opportunistically when touching this file.
 */
/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import './setup-auth';
import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

import { IdentityService } from '../src/modules/identity/identity.service';
import { IdentityModule } from '../src/modules/identity/identity.module';
import { createTestToken } from './utils/jwt-test.utils';
import { CurrentUser } from '../src/common/decorators/current-user.decorator';
import { Public } from '../src/common/decorators/public.decorator';
import { AuthenticatedUser } from '../src/common/auth/auth.types';
import * as crypto from 'crypto';

/**
 * Test Controller to mimic feature-level behavior.
 *
 * This controller simulates protected endpoints that would typically reside in feature modules.
 * It allows us to verify identity creation side effects (triggered by `resolveIdentity`)
 * without relying on actual business domain controllers, ensuring tests remain
 * focused purely on the Identity Lifecycle contract.
 */
@Controller('lifecycle-test')
class LifecycleTestController {
  constructor(private readonly identityService: IdentityService) {}

  @Public()
  @Get('public')
  publicEndpoint() {
    return { status: 'public_ok' };
  }

  @Get('protected')
  async protectedEndpoint(@CurrentUser() user: AuthenticatedUser) {
    // Mimic feature usage: Resolve identity (triggers creation as side effect)
    const identity = await this.identityService.resolveIdentity(user.id);
    return { status: 'protected_ok', identityId: identity.id };
  }
}

describe('Identity Lifecycle (E2E) - Contract Verification', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, IdentityModule],
      controllers: [LifecycleTestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Helper to generate unique sub for isolation
  const generateSub = (prefix = 'user') => `${prefix}-${crypto.randomUUID()}`;

  describe('Lazy Identity Creation Semantics', () => {
    it('should allow access to public endpoint without creating identity context', async () => {
      const sub = generateSub('lazy-public');
      const token = createTestToken({ sub });

      // Action: Call public endpoint with valid token
      // Behavioral assertion: Valid token is accepted (200 OK)
      // We do NOT assert on DB state because "absence of creation" is an internal side effect
      // and checking for it would require querying by sub (forbidden).
      await request(app.getHttpServer())
        .get('/lifecycle-test/public')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should Return an identity ID when ownership-requiring feature is accessed', async () => {
      const sub = generateSub('lazy-protected');
      const token = createTestToken({ sub });

      // Action: Call protected endpoint
      const res = await request(app.getHttpServer())
        .get('/lifecycle-test/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Behavioral Assertion: An identity ID is returned
      expect(res.body.identityId).toBeDefined();
    });
  });

  describe('Identity Reuse', () => {
    it('should reuse the same identity for subsequent requests', async () => {
      const sub = generateSub('reuse');
      const token = createTestToken({ sub });

      // First call
      const res1 = await request(app.getHttpServer())
        .get('/lifecycle-test/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const identityId1 = res1.body.identityId;
      expect(identityId1).toBeDefined();

      // Second call
      const res2 = await request(app.getHttpServer())
        .get('/lifecycle-test/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const identityId2 = res2.body.identityId;

      // Behavioral Assertion: The returned Identity IDs must be identical
      expect(identityId2).toBe(identityId1);
    });
  });

  describe('SYSTEM Actor Support', () => {
    it('should treat SYSTEM actors as first-class identities', async () => {
      const sub = 'SYSTEM';
      const token = createTestToken({ sub, roles: ['service-account'] });

      // Action
      const res = await request(app.getHttpServer())
        .get('/lifecycle-test/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Behavioral Assertion: Returns a valid identity ID
      const identityId = res.body.identityId;
      expect(identityId).toBeDefined();
      expect(typeof identityId).toBe('string');
    });
  });

  describe('Idempotency (Concurrent Creation)', () => {
    it('should handle concurrent requests consistently', async () => {
      const sub = generateSub('concurrent');
      const token = createTestToken({ sub });
      const server = app.getHttpServer();

      // Action: Fire 10 requests in parallel
      const promises = Array(10)
        .fill(null)
        .map(() =>
          request(server).get('/lifecycle-test/protected').set('Authorization', `Bearer ${token}`),
        );

      const responses = await Promise.all(promises);

      // Assertions
      // 1. All succeeded
      responses.forEach((res) => {
        expect(res.status).toBe(200);
      });

      // 2. All returned same identity ID
      const firstId = responses[0].body.identityId;
      responses.forEach((res) => {
        expect(res.body.identityId).toBe(firstId);
      });
    });
  });

  describe('JWT Isolation', () => {
    it('should not leak JWT sub into the Identity ID', async () => {
      const sub = generateSub('isolation');
      const token = createTestToken({ sub });

      const res = await request(app.getHttpServer())
        .get('/lifecycle-test/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const identityId = res.body.identityId;

      // Behavioral Assertion: Identity ID must NOT equal the JWT sub
      // This enforces that the system uses its own internal referencing scheme (UUIDs)
      // and does not treat the sub as the primary key.
      expect(identityId).not.toBe(sub);
      expect(identityId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });
});
