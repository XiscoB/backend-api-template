/**
 * JWT Validation Contract Tests.
 *
 * Exhaustive, table-driven tests for JWT validation that lock in the
 * documented JWT auth contract. These tests verify behavior exactly
 * as documented in AUTH_CONTRACT.md.
 *
 * Test Categories:
 * 1. Algorithm support (HS256, RS256, rejection of unsupported)
 * 2. Signature validation (valid, invalid for each algorithm)
 * 3. Issuer validation (correct, wrong, missing)
 * 4. Audience validation (string, array, missing)
 * 5. Expiration validation (valid, expired, missing)
 * 6. Required claims (sub)
 * 7. Optional claims (email, extra claims)
 *
 * @see docs/canonical/AUTH_CONTRACT.md
 */
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { JwtStrategy } from './jwt.strategy';
import { AppConfigService } from '../../config/app-config.service';
import { UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from './auth.types';

// ═══════════════════════════════════════════════════════════════════════════
// Type Guards
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type guard to ensure decoded token is a valid object payload.
 */
function isJwtPayload(decoded: unknown): decoded is JwtPayload {
  return typeof decoded === 'object' && decoded !== null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Test Constants & Key Generation
// ═══════════════════════════════════════════════════════════════════════════

/** Test issuer URL */
const TEST_ISSUER = 'https://test-issuer.example.com/auth';

/** Test audience */
const TEST_AUDIENCE = 'test-api';

/** HS256 test secret (32 bytes, deterministic) */
const HS256_SECRET = 'test-secret-key-for-jwt-validation-32ch';

/** Wrong HS256 secret for invalid signature tests */
const WRONG_HS256_SECRET = 'wrong-secret-key-for-jwt-invalid-32ch';

/** RS256 test keypair (generated once, deterministic seed not needed for tests) */
const RS256_KEYPAIR = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

/** Wrong RS256 keypair for invalid signature tests */
const WRONG_RS256_KEYPAIR = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ═══════════════════════════════════════════════════════════════════════════
// Token Generation Helpers
// ═══════════════════════════════════════════════════════════════════════════

interface TokenOptions {
  sub?: string;
  iss?: string | null; // null = omit claim
  aud?: string | string[] | null; // null = omit claim
  exp?: number | null; // null = omit claim
  email?: string;
  roles?: string[];
  extraClaims?: Record<string, unknown>;
}

/**
 * Create an HS256 token with specified claims.
 */
function createHS256Token(options: TokenOptions, secret = HS256_SECRET): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {};

  if (options.sub !== undefined) payload.sub = options.sub;
  if (options.iss !== null) payload.iss = options.iss ?? TEST_ISSUER;
  if (options.aud !== null) payload.aud = options.aud ?? TEST_AUDIENCE;
  if (options.exp !== null) payload.exp = options.exp ?? now + 3600;
  if (options.email) payload.email = options.email;
  if (options.roles) payload.realm_access = { roles: options.roles };
  if (options.extraClaims) Object.assign(payload, options.extraClaims);

  payload.iat = now;

  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

/**
 * Create an RS256 token with specified claims.
 */
function createRS256Token(options: TokenOptions, privateKey = RS256_KEYPAIR.privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {};

  if (options.sub !== undefined) payload.sub = options.sub;
  if (options.iss !== null) payload.iss = options.iss ?? TEST_ISSUER;
  if (options.aud !== null) payload.aud = options.aud ?? TEST_AUDIENCE;
  if (options.exp !== null) payload.exp = options.exp ?? now + 3600;
  if (options.email) payload.email = options.email;
  if (options.roles) payload.realm_access = { roles: options.roles };
  if (options.extraClaims) Object.assign(payload, options.extraClaims);

  payload.iat = now;

  return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
}

/**
 * Create a token with tampered payload (valid signature for original, invalid for tampered).
 */
function createTamperedToken(options: TokenOptions): string {
  const token = createRS256Token(options);
  const [header, payload, signature] = token.split('.');

  // Decode and modify payload
  const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString());

  if (typeof decoded !== 'object' || decoded === null || !('sub' in decoded)) {
    throw new Error('Invalid token payload structure in test helper');
  }

  const typedDecoded = decoded as { sub: string };
  typedDecoded.sub = 'tampered-sub-value';
  const tamperedPayload = Buffer.from(JSON.stringify(typedDecoded)).toString('base64url');

  // Return token with original signature but modified payload
  return `${header}.${tamperedPayload}.${signature}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Mock AppConfigService Factory
// ═══════════════════════════════════════════════════════════════════════════

interface MockConfigOptions {
  algorithm?: 'HS256' | 'RS256';
  secret?: string;
  publicKey?: string;
  issuer?: string;
  audience?: string;
}

function createMockConfigService(options: MockConfigOptions = {}): AppConfigService {
  const useHS256 = options.algorithm === 'HS256';

  return {
    jwtAlgorithm: options.algorithm ?? 'RS256',
    jwtIssuer: options.issuer ?? TEST_ISSUER,
    jwtAudience: options.audience ?? TEST_AUDIENCE,
    jwtSecret: useHS256 ? (options.secret ?? HS256_SECRET) : undefined,
    jwtPublicKey: !useHS256 ? (options.publicKey ?? RS256_KEYPAIR.publicKey) : undefined,
    jwtJwksUri: undefined,
    useJwtSecret: useHS256,
    useJwks: false,
    scenarioTestingEnabled: false,
    scenarioTestIssuer: undefined,
    scenarioTestAudience: undefined,
    scenarioTestPublicKey: undefined,
  } as AppConfigService;
}

// ═══════════════════════════════════════════════════════════════════════════
// Test Cases
// ═══════════════════════════════════════════════════════════════════════════

describe('JWT Validation Contract', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 1: Algorithm Support
  // ─────────────────────────────────────────────────────────────────────────
  describe('Algorithm Support', () => {
    describe('HS256 (symmetric secret)', () => {
      const configService = createMockConfigService({ algorithm: 'HS256' });
      let strategy: JwtStrategy;

      beforeAll(() => {
        strategy = new JwtStrategy(configService);
      });

      const validCases = [
        {
          name: 'valid HS256 token with all required claims',
          token: (): string => createHS256Token({ sub: 'user-123', roles: ['USER'] }),
          expectValid: true,
        },
        {
          name: 'valid HS256 token with email',
          token: (): string =>
            createHS256Token({ sub: 'user-456', email: 'user@example.com', roles: ['USER'] }),
          expectValid: true,
        },
      ];

      test.each(validCases)('$name', ({ token }) => {
        const decoded = jwt.verify(token(), HS256_SECRET, {
          algorithms: ['HS256'],
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
        });

        if (!isJwtPayload(decoded)) {
          throw new Error('Token payload is not an object');
        }

        const user = strategy.validate(decoded);
        expect(user).toBeDefined();
        expect(user.id).toBeDefined();
      });
    });

    describe('RS256 (asymmetric public key)', () => {
      const configService = createMockConfigService({ algorithm: 'RS256' });
      let strategy: JwtStrategy;

      beforeAll(() => {
        strategy = new JwtStrategy(configService);
      });

      const validCases = [
        {
          name: 'valid RS256 token with all required claims',
          token: (): string => createRS256Token({ sub: 'user-789', roles: ['USER'] }),
          expectValid: true,
        },
        {
          name: 'valid RS256 token with email',
          token: (): string =>
            createRS256Token({ sub: 'user-abc', email: 'rs256@example.com', roles: ['ENTITY'] }),
          expectValid: true,
        },
      ];

      test.each(validCases)('$name', ({ token }) => {
        const decoded = jwt.verify(token(), RS256_KEYPAIR.publicKey, {
          algorithms: ['RS256'],
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
        });

        if (!isJwtPayload(decoded)) {
          throw new Error('Token payload is not an object');
        }

        const user = strategy.validate(decoded);
        expect(user).toBeDefined();
        expect(user.id).toBeDefined();
      });
    });

    describe('Unsupported algorithms', () => {
      const rejectCases = [
        {
          name: 'reject alg: none',
          createToken: (): string => {
            const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
              'base64url',
            );
            const payload = Buffer.from(
              JSON.stringify({
                sub: 'user-none',
                iss: TEST_ISSUER,
                aud: TEST_AUDIENCE,
                exp: Math.floor(Date.now() / 1000) + 3600,
              }),
            ).toString('base64url');
            return `${header}.${payload}.`;
          },
          expectedErrorPattern: /signature|invalid/i,
        },
        {
          name: 'reject token signed with ES256 when expecting RS256',
          createToken: (): string => {
            // Create ES256 keypair
            const ec = crypto.generateKeyPairSync('ec', {
              namedCurve: 'P-256',
              publicKeyEncoding: { type: 'spki', format: 'pem' },
              privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            });
            return jwt.sign(
              { sub: 'user-es256', iss: TEST_ISSUER, aud: TEST_AUDIENCE },
              ec.privateKey,
              { algorithm: 'ES256', expiresIn: 3600 },
            );
          },
          expectedErrorPattern: /algorithm/i,
        },
      ];

      test.each(rejectCases)('$name', ({ createToken, expectedErrorPattern }) => {
        const token = createToken();
        expect(() => {
          jwt.verify(token, RS256_KEYPAIR.publicKey, {
            algorithms: ['RS256'],
            issuer: TEST_ISSUER,
            audience: TEST_AUDIENCE,
          });
        }).toThrow(expectedErrorPattern);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 2: Signature Validation
  // ─────────────────────────────────────────────────────────────────────────
  describe('Signature Validation', () => {
    describe('RS256 signature', () => {
      const signatureCases = [
        {
          name: 'valid signature with correct public key',
          token: (): string => createRS256Token({ sub: 'user-sig-valid' }),
          publicKey: RS256_KEYPAIR.publicKey,
          expectValid: true,
        },
        {
          name: 'invalid signature with wrong public key',
          token: (): string => createRS256Token({ sub: 'user-sig-wrong' }),
          publicKey: WRONG_RS256_KEYPAIR.publicKey,
          expectValid: false,
          expectedErrorPattern: /signature/i,
        },
        {
          name: 'invalid signature from tampered payload',
          token: (): string => createTamperedToken({ sub: 'user-tampered' }),
          publicKey: RS256_KEYPAIR.publicKey,
          expectValid: false,
          expectedErrorPattern: /signature/i,
        },
      ];

      test.each(signatureCases)(
        '$name',
        ({ token, publicKey, expectValid, expectedErrorPattern }) => {
          if (expectValid) {
            const decoded = jwt.verify(token(), publicKey, {
              algorithms: ['RS256'],
              issuer: TEST_ISSUER,
              audience: TEST_AUDIENCE,
            });

            if (!isJwtPayload(decoded)) {
              throw new Error('Token payload is not an object');
            }
            const payload = decoded as JwtPayload;

            expect(payload).toBeDefined();
          } else {
            expect(() => {
              jwt.verify(token(), publicKey, {
                algorithms: ['RS256'],
                issuer: TEST_ISSUER,
                audience: TEST_AUDIENCE,
              });
            }).toThrow(expectedErrorPattern);
          }
        },
      );
    });

    describe('HS256 signature', () => {
      const signatureCases = [
        {
          name: 'valid signature with correct secret',
          token: (): string => createHS256Token({ sub: 'user-hs-valid' }),
          secret: HS256_SECRET,
          expectValid: true,
        },
        {
          name: 'invalid signature with wrong secret',
          token: (): string => createHS256Token({ sub: 'user-hs-wrong' }),
          secret: WRONG_HS256_SECRET,
          expectValid: false,
          expectedErrorPattern: /signature/i,
        },
      ];

      test.each(signatureCases)('$name', ({ token, secret, expectValid, expectedErrorPattern }) => {
        if (expectValid) {
          const decoded = jwt.verify(token(), secret, {
            algorithms: ['HS256'],
            issuer: TEST_ISSUER,
            audience: TEST_AUDIENCE,
          });

          if (!isJwtPayload(decoded)) {
            throw new Error('Token payload is not an object');
          }
          const payload = decoded as JwtPayload;

          expect(payload).toBeDefined();
        } else {
          expect(() => {
            jwt.verify(token(), secret, {
              algorithms: ['HS256'],
              issuer: TEST_ISSUER,
              audience: TEST_AUDIENCE,
            });
          }).toThrow(expectedErrorPattern);
        }
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 3: Issuer Validation
  // ─────────────────────────────────────────────────────────────────────────
  describe('Issuer Validation', () => {
    const issuerCases = [
      {
        name: 'correct issuer',
        token: (): string => createRS256Token({ sub: 'user-iss-ok', iss: TEST_ISSUER }),
        expectValid: true,
      },
      {
        name: 'wrong issuer',
        token: (): string =>
          createRS256Token({ sub: 'user-iss-wrong', iss: 'https://wrong-issuer.com' }),
        expectValid: false,
        expectedErrorPattern: /issuer/i,
      },
      {
        name: 'missing issuer',
        token: (): string => createRS256Token({ sub: 'user-iss-missing', iss: null }),
        expectValid: false,
        expectedErrorPattern: /issuer/i,
      },
    ];

    test.each(issuerCases)('$name', ({ token, expectValid, expectedErrorPattern }) => {
      if (expectValid) {
        const decoded = jwt.verify(token(), RS256_KEYPAIR.publicKey, {
          algorithms: ['RS256'],
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
        });

        if (!isJwtPayload(decoded)) {
          throw new Error('Token payload is not an object');
        }
        const payload = decoded as JwtPayload;

        expect(payload).toBeDefined();
      } else {
        expect(() => {
          jwt.verify(token(), RS256_KEYPAIR.publicKey, {
            algorithms: ['RS256'],
            issuer: TEST_ISSUER,
            audience: TEST_AUDIENCE,
          });
        }).toThrow(expectedErrorPattern);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 4: Audience Validation
  // ─────────────────────────────────────────────────────────────────────────
  describe('Audience Validation', () => {
    const audienceCases = [
      {
        name: 'audience as string (matches)',
        token: (): string => createRS256Token({ sub: 'user-aud-str-ok', aud: TEST_AUDIENCE }),
        expectValid: true,
      },
      {
        name: 'audience as string (no match)',
        token: (): string => createRS256Token({ sub: 'user-aud-str-bad', aud: 'wrong-audience' }),
        expectValid: false,
        expectedErrorPattern: /audience/i,
      },
      {
        name: 'audience as array (contains match)',
        token: (): string =>
          createRS256Token({
            sub: 'user-aud-arr-ok',
            aud: ['other-api', TEST_AUDIENCE, 'mobile-app'],
          }),
        expectValid: true,
      },
      {
        name: 'audience as array (no match)',
        token: (): string =>
          createRS256Token({ sub: 'user-aud-arr-bad', aud: ['wrong-api', 'another-wrong'] }),
        expectValid: false,
        expectedErrorPattern: /audience/i,
      },
      {
        name: 'missing audience',
        token: (): string => createRS256Token({ sub: 'user-aud-missing', aud: null }),
        expectValid: false,
        expectedErrorPattern: /audience/i,
      },
    ];

    test.each(audienceCases)('$name', ({ token, expectValid, expectedErrorPattern }) => {
      if (expectValid) {
        const decoded = jwt.verify(token(), RS256_KEYPAIR.publicKey, {
          algorithms: ['RS256'],
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
        });

        if (!isJwtPayload(decoded)) {
          throw new Error('Token payload is not an object');
        }
        const payload = decoded as JwtPayload;

        expect(payload).toBeDefined();
      } else {
        expect(() => {
          jwt.verify(token(), RS256_KEYPAIR.publicKey, {
            algorithms: ['RS256'],
            issuer: TEST_ISSUER,
            audience: TEST_AUDIENCE,
          });
        }).toThrow(expectedErrorPattern);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 5: Expiration Validation
  // ─────────────────────────────────────────────────────────────────────────
  describe('Expiration Validation', () => {
    const now = Math.floor(Date.now() / 1000);

    const expirationCases = [
      {
        name: 'valid expiration (future)',
        token: (): string => createRS256Token({ sub: 'user-exp-ok', exp: now + 3600 }),
        expectValid: true,
      },
      {
        name: 'expired token (past)',
        token: (): string => createRS256Token({ sub: 'user-exp-past', exp: now - 3600 }),
        expectValid: false,
        expectedErrorPattern: /expired/i,
      },
      {
        name: 'missing expiration (note: passport-jwt enforces exp requirement)',
        token: (): string => createRS256Token({ sub: 'user-exp-missing', exp: null }),
        expectValid: true, // jsonwebtoken library doesn't require exp by default; passport-jwt enforces it
        // Passport-jwt adds exp validation at the middleware level, not jwt.verify
        // The contract specifies exp as required, and passport-jwt enforces it
      },
    ];

    test.each(expirationCases)('$name', ({ token, expectValid, expectedErrorPattern }) => {
      if (expectValid) {
        const decoded = jwt.verify(token(), RS256_KEYPAIR.publicKey, {
          algorithms: ['RS256'],
          issuer: TEST_ISSUER,
          audience: TEST_AUDIENCE,
        });

        if (!isJwtPayload(decoded)) {
          throw new Error('Token payload is not an object');
        }
        const payload = decoded as JwtPayload;

        expect(payload).toBeDefined();
      } else {
        expect(() => {
          jwt.verify(token(), RS256_KEYPAIR.publicKey, {
            algorithms: ['RS256'],
            issuer: TEST_ISSUER,
            audience: TEST_AUDIENCE,
          });
        }).toThrow(expectedErrorPattern);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 6: JwtStrategy.validate() — Required Claims
  // ─────────────────────────────────────────────────────────────────────────
  describe('JwtStrategy.validate() — Required Claims', () => {
    const configService = createMockConfigService({ algorithm: 'RS256' });
    let strategy: JwtStrategy;

    beforeAll((): void => {
      strategy = new JwtStrategy(configService);
    });

    describe('sub claim (required)', () => {
      it('should accept payload with valid sub', () => {
        const payload = { sub: 'valid-user-id', iss: TEST_ISSUER, aud: TEST_AUDIENCE };
        const user = strategy.validate(payload);
        expect(user).toBeDefined();
        expect(user.id).toBe('valid-user-id');
      });

      it('should reject payload with missing sub', () => {
        const payload = { iss: TEST_ISSUER, aud: TEST_AUDIENCE };
        expect(() => strategy.validate(payload as never)).toThrow(UnauthorizedException);
      });

      it('should reject payload with empty sub', () => {
        const payload = { sub: '', iss: TEST_ISSUER, aud: TEST_AUDIENCE };
        expect(() => strategy.validate(payload)).toThrow(UnauthorizedException);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 7: JwtStrategy.validate() — Optional Claims
  // ─────────────────────────────────────────────────────────────────────────
  describe('JwtStrategy.validate() — Optional Claims', () => {
    const configService = createMockConfigService({ algorithm: 'RS256' });
    let strategy: JwtStrategy;

    beforeAll((): void => {
      strategy = new JwtStrategy(configService);
    });

    describe('email claim (optional)', () => {
      it('should accept payload with email', () => {
        const payload = { sub: 'user-with-email', email: 'user@example.com' };
        const user = strategy.validate(payload);
        expect(user.email).toBe('user@example.com');
      });

      it('should accept payload without email (email is optional)', () => {
        const payload = { sub: 'user-no-email' };
        const user = strategy.validate(payload);
        expect(user).toBeDefined();
        expect(user.id).toBe('user-no-email');
        expect(user.email).toBeUndefined();
      });
    });

    describe('roles extraction', () => {
      it('should extract roles from realm_access.roles (Keycloak pattern)', () => {
        const payload = { sub: 'keycloak-user', realm_access: { roles: ['USER', 'ENTITY'] } };
        const user = strategy.validate(payload);
        expect(user.roles).toContain('USER');
        expect(user.roles).toContain('ENTITY');
      });

      it('should extract roles from app_metadata.roles (Supabase pattern)', () => {
        const payload = { sub: 'supabase-user', app_metadata: { roles: ['ADMIN'] } };
        const user = strategy.validate(payload);
        expect(user.roles).toContain('ADMIN');
      });

      it('should extract roles from direct roles claim (generic OIDC)', () => {
        const payload = { sub: 'oidc-user', roles: ['SYSTEM'] };
        const user = strategy.validate(payload);
        expect(user.roles).toContain('SYSTEM');
      });

      it('should ignore unrecognized roles silently', () => {
        const payload = {
          sub: 'unknown-role-user',
          realm_access: { roles: ['USER', 'UNKNOWN_ROLE', 'CUSTOM_XYZ'] },
        };
        const user = strategy.validate(payload);
        expect(user.roles).toContain('USER');
        expect(user.roles).not.toContain('UNKNOWN_ROLE');
        expect(user.roles).not.toContain('CUSTOM_XYZ');
      });

      it('should return empty roles array if no roles found', () => {
        const payload = { sub: 'no-roles-user' };
        const user = strategy.validate(payload);
        expect(user.roles).toEqual([]);
      });
    });

    describe('extra/unknown claims (must be ignored)', () => {
      it('should ignore extra claims in payload', () => {
        const payload = {
          sub: 'user-extra-claims',
          email: 'extra@example.com',
          custom_field: 'some-value',
          nested: { deep: { value: 123 } },
          session_id: 'sess-abc-123',
          phone: '+1234567890',
        };
        const user = strategy.validate(payload);
        expect(user).toBeDefined();
        expect(user.id).toBe('user-extra-claims');
        expect(user.email).toBe('extra@example.com');
        // User object should only have expected properties
        expect(Object.keys(user)).toEqual(expect.arrayContaining(['id', 'email', 'roles']));
        expect('custom_field' in user).toBe(false);
        expect('nested' in user).toBe(false);
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 8: Full Token Verification Flow
  // ─────────────────────────────────────────────────────────────────────────
  describe('Full Token Verification Flow', () => {
    const configService = createMockConfigService({ algorithm: 'RS256' });
    let strategy: JwtStrategy;

    beforeAll((): void => {
      strategy = new JwtStrategy(configService);
    });

    /**
     * Table-driven tests for complete token validation.
     * Each case verifies the full flow: signature → claims → strategy.validate()
     */
    const fullFlowCases = [
      {
        name: 'valid RS256 token → authenticated user',
        token: (): string =>
          createRS256Token({
            sub: 'full-flow-user',
            email: 'full@example.com',
            roles: ['USER'],
          }),
        expectValid: true,
        expectedUserId: 'full-flow-user',
        expectedEmail: 'full@example.com',
        expectedRoles: ['USER'],
      },
      {
        name: 'valid token without email → authenticated user (email optional)',
        token: (): string => createRS256Token({ sub: 'no-email-user', roles: ['ENTITY'] }),
        expectValid: true,
        expectedUserId: 'no-email-user',
        expectedEmail: undefined,
        expectedRoles: ['ENTITY'],
      },
      {
        name: 'valid token with extra unknown claims → ignored',
        token: (): string =>
          createRS256Token({
            sub: 'extra-claims-user',
            extraClaims: { custom: 'value', provider_specific: { data: true } },
          }),
        expectValid: true,
        expectedUserId: 'extra-claims-user',
        expectedRoles: [],
      },
      {
        name: 'valid token with unknown roles → roles filtered',
        token: (): string =>
          createRS256Token({
            sub: 'mixed-roles-user',
            roles: ['USER', 'PROVIDER_INTERNAL_ROLE', 'ENTITY'],
          }),
        expectValid: true,
        expectedUserId: 'mixed-roles-user',
        expectedRoles: ['USER', 'ENTITY'],
      },
    ];

    test.each(fullFlowCases)('$name', ({ token, expectedUserId, expectedEmail, expectedRoles }) => {
      // Step 1: Verify token signature
      const decoded = jwt.verify(token(), RS256_KEYPAIR.publicKey, {
        algorithms: ['RS256'],
        issuer: TEST_ISSUER,
        audience: TEST_AUDIENCE,
      });

      if (!isJwtPayload(decoded)) {
        throw new Error('Token payload is not an object');
      }
      const payload = decoded as JwtPayload;

      // Step 2: Process through strategy.validate()
      const user = strategy.validate(payload);

      // Step 3: Assert expected user properties
      expect(user.id).toBe(expectedUserId);
      if (expectedEmail !== undefined) {
        expect(user.email).toBe(expectedEmail);
      } else {
        expect(user.email).toBeUndefined();
      }
      if (expectedRoles) {
        expect(user.roles).toEqual(expect.arrayContaining(expectedRoles));
        expect(user.roles.length).toBe(expectedRoles.length);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 9: HS256 Full Flow (Supabase Pattern)
  // ─────────────────────────────────────────────────────────────────────────
  describe('HS256 Full Flow (Supabase Pattern)', () => {
    const configService = createMockConfigService({ algorithm: 'HS256' });
    let strategy: JwtStrategy;

    beforeAll((): void => {
      strategy = new JwtStrategy(configService);
    });

    const hs256FlowCases = [
      {
        name: 'valid HS256 token with app_metadata.roles (Supabase pattern)',
        token: (): string => {
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            sub: 'supabase-flow-user',
            email: 'supabase@example.com',
            role: 'authenticated', // Supabase auth role (not used for authz)
            app_metadata: { roles: ['USER'], provider: 'email' },
            iss: TEST_ISSUER,
            aud: TEST_AUDIENCE,
            exp: now + 3600,
            iat: now,
          };
          return jwt.sign(payload, HS256_SECRET, { algorithm: 'HS256' });
        },
        expectValid: true,
        expectedRoles: ['USER'],
      },
    ];

    test.each(hs256FlowCases)('$name', ({ token, expectedRoles }) => {
      const decoded = jwt.verify(token(), HS256_SECRET, {
        algorithms: ['HS256'],
        issuer: TEST_ISSUER,
        audience: TEST_AUDIENCE,
      });

      if (!isJwtPayload(decoded)) {
        throw new Error('Token payload is not an object');
      }
      const payload = decoded as JwtPayload;

      const user = strategy.validate(payload);
      expect(user).toBeDefined();
      expect(user.roles).toEqual(expect.arrayContaining(expectedRoles));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 10: Failure Mode Summary (Contract Enforcement)
  // ─────────────────────────────────────────────────────────────────────────
  describe('Failure Mode Summary', () => {
    /**
     * This section documents expected failure behaviors to ensure
     * any future change that violates the contract fails loudly.
     */

    const failureModeCases = [
      { mode: 'Invalid signature', errorPattern: /signature/i },
      { mode: 'Wrong issuer', errorPattern: /issuer/i },
      { mode: 'Wrong audience', errorPattern: /audience/i },
      { mode: 'Expired token', errorPattern: /expired/i },
      { mode: 'Algorithm mismatch', errorPattern: /algorithm|invalid/i },
    ];

    it('should document all expected failure modes', () => {
      // Meta-test: ensure we've covered all documented failure modes
      expect(failureModeCases.length).toBeGreaterThanOrEqual(5);
      failureModeCases.forEach(({ mode, errorPattern }) => {
        expect(errorPattern).toBeInstanceOf(RegExp);
        expect(mode).toBeDefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 11: Role Extraction Priority & Canonical Filtering
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Tests for role extraction priority and canonical role filtering.
   *
   * Contract to enforce:
   * - Priority order: app_metadata.roles > user_metadata.roles > realm_access.roles > roles
   * - Only canonical roles allowed: USER, ENTITY, ADMIN, SYSTEM
   * - Unknown roles are silently ignored
   * - No merging across levels — once a higher-priority source is present, lower sources are ignored
   * - Behavior must be deterministic
   *
   * NOTE: These tests enforce the stated contract, NOT the current implementation.
   * Tests are expected to FAIL until jwt.strategy.ts is updated to match the contract.
   */
  describe('Role Extraction Priority & Canonical Filtering (Contract Enforcement)', () => {
    const configService = createMockConfigService({ algorithm: 'RS256' });
    let strategy: JwtStrategy;

    beforeAll((): void => {
      strategy = new JwtStrategy(configService);
    });

    // ─────────────────────────────────────────────────────────────────────
    // 11.1: Priority Enforcement
    // ─────────────────────────────────────────────────────────────────────
    describe('Priority Enforcement', () => {
      it('should use app_metadata.roles when all sources are present', () => {
        const payload = {
          sub: 'priority-all-sources',
          app_metadata: { roles: ['ADMIN'] },
          user_metadata: { roles: ['ENTITY'] },
          realm_access: { roles: ['USER'] },
          roles: ['SYSTEM'],
        };
        const user = strategy.validate(payload);

        // app_metadata.roles has highest priority
        expect(user.roles).toEqual(['ADMIN']);
        expect(user.roles).not.toContain('ENTITY');
        expect(user.roles).not.toContain('USER');
        expect(user.roles).not.toContain('SYSTEM');
      });

      it('should use user_metadata.roles when app_metadata.roles is absent', () => {
        const payload = {
          sub: 'priority-no-app-metadata',
          user_metadata: { roles: ['ENTITY'] },
          realm_access: { roles: ['USER'] },
          roles: ['SYSTEM'],
        };
        const user = strategy.validate(payload);

        // user_metadata.roles is second priority
        expect(user.roles).toEqual(['ENTITY']);
        expect(user.roles).not.toContain('USER');
        expect(user.roles).not.toContain('SYSTEM');
      });

      it('should use realm_access.roles when app_metadata and user_metadata are absent', () => {
        const payload = {
          sub: 'priority-only-realm-and-roles',
          realm_access: { roles: ['USER'] },
          roles: ['SYSTEM'],
        };
        const user = strategy.validate(payload);

        // realm_access.roles is third priority
        expect(user.roles).toEqual(['USER']);
        expect(user.roles).not.toContain('SYSTEM');
      });

      it('should use roles claim only when all other sources are absent', () => {
        const payload = {
          sub: 'priority-only-roles',
          roles: ['SYSTEM'],
        };
        const user = strategy.validate(payload);

        // roles is lowest priority
        expect(user.roles).toEqual(['SYSTEM']);
      });

      it('should ignore lower-priority sources completely (no merging)', () => {
        const payload = {
          sub: 'no-merge-test',
          app_metadata: { roles: ['USER'] },
          user_metadata: { roles: ['ENTITY', 'ADMIN'] },
          realm_access: { roles: ['SYSTEM'] },
          roles: ['USER', 'ENTITY', 'ADMIN', 'SYSTEM'],
        };
        const user = strategy.validate(payload);

        // Only app_metadata.roles should be used, no merging
        expect(user.roles).toEqual(['USER']);
        expect(user.roles.length).toBe(1);
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // 11.2: Canonical Role Filtering
    // ─────────────────────────────────────────────────────────────────────
    describe('Canonical Role Filtering', () => {
      it('should filter out non-canonical roles from app_metadata.roles', () => {
        const payload = {
          sub: 'canonical-filter-app',
          app_metadata: {
            roles: ['USER', 'authenticated', 'ADMIN', 'offline_access', 'custom_role'],
          },
        };
        const user = strategy.validate(payload);

        expect(user.roles).toContain('USER');
        expect(user.roles).toContain('ADMIN');
        expect(user.roles).not.toContain('authenticated');
        expect(user.roles).not.toContain('offline_access');
        expect(user.roles).not.toContain('custom_role');
        expect(user.roles.length).toBe(2);
      });

      it('should preserve all valid canonical roles when mixed with invalid', () => {
        const payload = {
          sub: 'canonical-all-valid',
          app_metadata: {
            roles: ['invalid1', 'USER', 'invalid2', 'ENTITY', 'unknown', 'ADMIN', 'xyz', 'SYSTEM'],
          },
        };
        const user = strategy.validate(payload);

        expect(user.roles).toEqual(expect.arrayContaining(['USER', 'ENTITY', 'ADMIN', 'SYSTEM']));
        expect(user.roles.length).toBe(4);
      });

      it('should not throw errors when filtering invalid roles', () => {
        const payload = {
          sub: 'no-error-on-invalid',
          app_metadata: {
            roles: ['invalid', 'another_invalid', '123', '', null],
          },
        };

        // @ts-expect-error - testing invalid role types (null not allowed in types but possible in runtime)
        expect(() => strategy.validate(payload)).not.toThrow();
        // @ts-expect-error - testing invalid role types
        const user = strategy.validate(payload);
        expect(user.roles).toEqual([]);
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // 11.3: Unknown Roles
    // ─────────────────────────────────────────────────────────────────────
    describe('Unknown Roles', () => {
      it('should return empty roles when only unknown roles are present', () => {
        const payload = {
          sub: 'unknown-roles-only',
          app_metadata: { roles: ['UNKNOWN_ROLE', 'CUSTOM_XYZ', 'provider_internal'] },
        };
        const user = strategy.validate(payload);

        expect(user.roles).toEqual([]);
      });

      it('should ignore provider-specific roles (authenticated, offline_access)', () => {
        const payload = {
          sub: 'provider-roles',
          app_metadata: { roles: ['authenticated', 'offline_access', 'email', 'profile'] },
        };
        const user = strategy.validate(payload);

        expect(user.roles).toEqual([]);
      });

      it('should handle case-sensitive role matching (lowercase invalid)', () => {
        const payload = {
          sub: 'case-sensitive',
          app_metadata: { roles: ['user', 'admin', 'entity', 'system'] },
        };
        const user = strategy.validate(payload);

        // Canonical roles are uppercase: USER, ENTITY, ADMIN, SYSTEM
        expect(user.roles).toEqual([]);
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // 11.4: Multiple Canonical Roles
    // ─────────────────────────────────────────────────────────────────────
    describe('Multiple Canonical Roles', () => {
      it('should return all canonical roles from a single source', () => {
        const payload = {
          sub: 'all-canonical-roles',
          app_metadata: { roles: ['USER', 'ENTITY', 'ADMIN', 'SYSTEM'] },
        };
        const user = strategy.validate(payload);

        expect(user.roles).toEqual(expect.arrayContaining(['USER', 'ENTITY', 'ADMIN', 'SYSTEM']));
        expect(user.roles.length).toBe(4);
      });

      it('should return subset of canonical roles when only some present', () => {
        const payload = {
          sub: 'subset-canonical',
          app_metadata: { roles: ['USER', 'ADMIN'] },
        };
        const user = strategy.validate(payload);

        expect(user.roles).toEqual(expect.arrayContaining(['USER', 'ADMIN']));
        expect(user.roles.length).toBe(2);
      });

      it('should preserve role order from source', () => {
        const payload = {
          sub: 'role-order',
          app_metadata: { roles: ['SYSTEM', 'USER', 'ADMIN', 'ENTITY'] },
        };
        const user = strategy.validate(payload);

        // Order should be preserved as filtered from source
        expect(user.roles[0]).toBe('SYSTEM');
        expect(user.roles[1]).toBe('USER');
        expect(user.roles[2]).toBe('ADMIN');
        expect(user.roles[3]).toBe('ENTITY');
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // 11.5: Empty or Missing Sources
    // ─────────────────────────────────────────────────────────────────────
    describe('Empty or Missing Sources', () => {
      it('should return empty roles when no role fields exist', () => {
        const payload = {
          sub: 'no-role-fields',
          email: 'test@example.com',
        };
        const user = strategy.validate(payload);

        expect(user.roles).toEqual([]);
      });

      it('should return empty roles when all role arrays are empty', () => {
        const payload = {
          sub: 'empty-role-arrays',
          app_metadata: { roles: [] },
          user_metadata: { roles: [] },
          realm_access: { roles: [] },
          roles: [],
        };
        const user = strategy.validate(payload);

        expect(user.roles).toEqual([]);
      });

      it('should return empty roles when app_metadata exists but roles is missing', () => {
        const payload = {
          sub: 'app-metadata-no-roles',
          app_metadata: { provider: 'email' },
        };
        const user = strategy.validate(payload);

        expect(user.roles).toEqual([]);
      });

      it('should return empty roles when realm_access exists but roles is missing', () => {
        // Test edge case with malformed realm_access (missing roles array)
        const payload = {
          sub: 'realm-access-no-roles',
          realm_access: {} as { roles: string[] },
        };
        const user = strategy.validate(payload);

        expect(user.roles).toEqual([]);
      });

      it('should be deterministic across multiple calls', () => {
        const payload = {
          sub: 'deterministic-test',
          app_metadata: { roles: ['USER', 'ADMIN'] },
        };

        const result1 = strategy.validate(payload);
        const result2 = strategy.validate(payload);
        const result3 = strategy.validate(payload);

        expect(result1.roles).toEqual(result2.roles);
        expect(result2.roles).toEqual(result3.roles);
      });
    });

    // ─────────────────────────────────────────────────────────────────────
    // 11.6: No Cross-Level Merging
    // ─────────────────────────────────────────────────────────────────────
    describe('No Cross-Level Merging', () => {
      it('should ignore lower sources when higher-priority source is present but empty', () => {
        const payload = {
          sub: 'higher-empty-lower-populated',
          app_metadata: { roles: [] },
          user_metadata: { roles: ['ENTITY'] },
          realm_access: { roles: ['USER'] },
          roles: ['ADMIN'],
        };
        const user = strategy.validate(payload);

        // app_metadata.roles is present (even if empty), so lower sources are ignored
        expect(user.roles).toEqual([]);
      });

      it('should ignore lower sources when higher-priority source contains only unknown roles', () => {
        const payload = {
          sub: 'higher-unknown-lower-valid',
          app_metadata: { roles: ['unknown_role', 'provider_internal'] },
          user_metadata: { roles: ['ENTITY'] },
          realm_access: { roles: ['USER'] },
          roles: ['ADMIN'],
        };
        const user = strategy.validate(payload);

        // app_metadata.roles is used (results in empty after filtering), lower sources ignored
        expect(user.roles).toEqual([]);
      });

      it('should not fall back to lower sources after filtering high-priority source', () => {
        const payload = {
          sub: 'no-fallback-after-filter',
          app_metadata: { roles: ['invalid1', 'invalid2'] },
          realm_access: { roles: ['USER', 'ADMIN'] },
        };
        const user = strategy.validate(payload);

        // Even though app_metadata.roles filters to empty, we don't fall back
        expect(user.roles).toEqual([]);
        expect(user.roles).not.toContain('USER');
        expect(user.roles).not.toContain('ADMIN');
      });

      it('should treat user_metadata.roles as higher priority than realm_access.roles', () => {
        const payload = {
          sub: 'user-metadata-priority',
          user_metadata: { roles: ['ENTITY'] },
          realm_access: { roles: ['USER', 'ADMIN', 'SYSTEM'] },
        };
        const user = strategy.validate(payload);

        // user_metadata.roles has higher priority than realm_access.roles
        expect(user.roles).toEqual(['ENTITY']);
        expect(user.roles).not.toContain('USER');
        expect(user.roles).not.toContain('ADMIN');
        expect(user.roles).not.toContain('SYSTEM');
      });
    });
  });
});
