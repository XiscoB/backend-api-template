/**
 * JWT test utilities for e2e testing.
 *
 * Uses the STATIC scenario test keys from scripts/scenarios/lib/test-keys.js.
 * These keys match what app-config.service.ts uses in SCENARIO_TESTING mode.
 *
 * Using static keys (vs runtime-generated) ensures:
 * - Tests are reproducible across runs
 * - Keys match backend's scenario testing mode
 * - No coordination needed between test setup and app initialization
 *
 * SECURITY NOTE: These are TEST-ONLY keys committed to git intentionally.
 * The backend refuses to use them in production (NODE_ENV === production).
 */
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

/**
 * Static RSA 2048-bit test keys (matches scripts/scenarios/lib/test-keys.js)
 *
 * These MUST match the keys in:
 * - src/config/app-config.service.ts (SCENARIO_TEST_PUBLIC_KEY)
 * - scripts/scenarios/lib/test-keys.js (TEST_PUBLIC_KEY, TEST_PRIVATE_KEY)
 */
export const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCkUYwmw+6BWehW
ZFQDJbr6dvVrMW+oK4+wm8+XS880qN79vM9/dmVB3L6nrnthswpYvAD7kyHfNc4y
oaJ2gE6A4vQyUcQgbcbKeOyXN0drghz/z+gLgDOZX0eoh5KOGj2aLDJ50Jfb1G9B
g2TzeQDZXtgZww15AJ/yQC/GFoJm9/aGs13pj7pqrQpdIJIWskPxYFKYzKs1oo6I
Yrrikwpm4vph/5xf7mQha2bMGq+xiOclNC8klkVOy1w7C7iI5cXcix05LSYyaPJ8
fhl2lbmCa3BXugvm5qCilhA/f88rEllLJOY7/H3Tlqb/9yjgMHm8Kf8FmNLmERl9
jTE8S0JNAgMBAAECggEASxvdYNDZofW7TlYQ0tl5xMgAeU2BGNFEnnkyJBmqboss
VrZp8HzpXvgsi9AlJKzms1XIazY/Wtyo0prwfJM8jwxui9u1Nw+GuQEaQCqr8jfo
0oOxsSQaMeaMBjxmIJ9c/i5qqiTPbVQGwN7zE5mBalrAk9IFRASll+GAFN8wHylI
VhpZvVY1exI+GzNWS/dDi05rkaCb1aI44eZwgiE7Y5fGdQPxkiEcJkwzSSIWvChp
5WYPZvaMzmQH5X9NCbFIfe1D82GnT615Y8CtUBZiCQGB9gsXzmcwKUMB9MdBUCj2
FLfxhcnEm6DQJwpQblvC3gnXz6FR17ssu4lNZhmIbwKBgQDQy/nxaqfGYoUfdtTv
o3wIFaN0vdEofTniE0nae1BMDH6lXKUMZfJqYuONREAxnvAODaWKR/0o+2JKkZZ5
clhwZCKK8jWBA9sFwERsQx0DDffb0cncaphmS66ZxORb8Ztjl/JPN9jCSY1+b7Dn
1vDrs2VJwQG5B7okyoQBauN/uwKBgQDJd2mNc2Hx7V4Q6D12JXvTaoqY82itpdEy
P4wCd02iiuMzlmn8mKfNVCImjxnw+woc0qC1A0+FZ5Eg/zvomeSSQjE0ZrN2JuLt
sdiP+PCwemUJHuFuvbXYIM7q6XgXZJElZXuK7jeh1r0U/r/jzhjuNIz1AaaEjHM6
zWqOrSaRlwKBgEIudWINQXLDZZjMjMAMnNLfMPle9T4VO1Sqcn1bGt+QElCN5g7g
/Y61G5V6bbKMw2Bg+Pi0yszDqasjLIQAN4Iga0aJcWYcd78B6245c6e1NLwragWA
kB/Um1pIK23tTiiqT/bGJ+GleMD73CIQYjsDmPZgxBAHH/xraJ4eaE/jAoGAVYMK
2VA1LYOr3o9EryYf1c+t/leqgbIVBjf0zIMo/6nl39qjJ+T/rGZejHFG+IMFetBo
CAzcruoTrqbHHeZcHzxbODuzRp4gyfUnz4xBVRbOVb22v9NkINVkHk90erFj7jSR
6JlOIbJM1WF/v0iWSl0hy0ilDjOzIS1ZYi/aZAcCgYBec6EkBDD9rtYipwxTrgf2
oXIFKJq4WRxxoN57GNu/WUj5YV8/EubTBtfvORObZtHhGvhEHImlBBghXOFeN2kA
U7JAVNB4POGKl5ELRRch8EAVf0yxDWHBa9o5y3LuHALNM9fTZvVg1eQ/QKFy1AZj
PODUiAa/6dhX03zN0OizbA==
-----END PRIVATE KEY-----`;

export const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApFGMJsPugVnoVmRUAyW6
+nb1azFvqCuPsJvPl0vPNKje/bzPf3ZlQdy+p657YbMKWLwA+5Mh3zXOMqGidoBO
gOL0MlHEIG3GynjslzdHa4Ic/8/oC4AzmV9HqIeSjho9miwyedCX29RvQYNk83kA
2V7YGcMNeQCf8kAvxhaCZvf2hrNd6Y+6aq0KXSCSFrJD8WBSmMyrNaKOiGK64pMK
ZuL6Yf+cX+5kIWtmzBqvsYjnJTQvJJZFTstcOwu4iOXF3IsdOS0mMmjyfH4ZdpW5
gmtwV7oL5uagopYQP3/PKxJZSyTmO/x905am//co4DB5vCn/BZjS5hEZfY0xPEtC
TQIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Wrong key pair for invalid signature tests.
 * Generated at runtime since it just needs to be different from the test key.
 */
const wrongKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const WRONG_PRIVATE_KEY = wrongKeyPair.privateKey;

/**
 * Test configuration constants (MUST match scenario testing mode).
 * These values match app-config.service.ts SCENARIO_TEST_* constants.
 */
export const TEST_ISSUER = 'scenario-test-issuer';
export const TEST_AUDIENCE = 'scenario-test-audience';

/**
 * JWT payload for test tokens.
 */
export interface TestTokenPayload {
  sub: string;
  email?: string;
  roles?: string[];
  iss?: string;
  aud?: string;
}

/**
 * Options for creating test tokens.
 */
export interface CreateTokenOptions {
  /** Token expiration in seconds (default: 1 hour) */
  expiresIn?: number;
  /** Use wrong private key to create invalid signature */
  useWrongKey?: boolean;
  /** Override issuer (default: TEST_ISSUER) */
  issuer?: string;
  /** Override audience (default: TEST_AUDIENCE) */
  audience?: string;
}

/**
 * Create a valid test JWT.
 *
 * @param payload - Token payload (sub, email, roles)
 * @param options - Token options (expiration, key, issuer, audience)
 * @returns Signed JWT string
 */
export function createTestToken(
  payload: TestTokenPayload,
  options: CreateTokenOptions = {},
): string {
  const {
    expiresIn = 3600,
    useWrongKey = false,
    issuer = TEST_ISSUER,
    audience = TEST_AUDIENCE,
  } = options;

  const privateKey = useWrongKey ? WRONG_PRIVATE_KEY : TEST_PRIVATE_KEY;

  const tokenPayload = {
    sub: payload.sub,
    ...(payload.email && { email: payload.email }),
    ...(payload.roles && {
      realm_access: {
        roles: payload.roles,
      },
    }),
  };

  return jwt.sign(tokenPayload, privateKey, {
    algorithm: 'RS256',
    expiresIn,
    issuer,
    audience,
  });
}

/**
 * Create an expired test JWT.
 *
 * @param payload - Token payload
 * @returns Expired JWT string
 */
export function createExpiredToken(payload: TestTokenPayload): string {
  const tokenPayload = {
    sub: payload.sub,
    ...(payload.email && { email: payload.email }),
    ...(payload.roles && {
      realm_access: {
        roles: payload.roles,
      },
    }),
    iss: TEST_ISSUER,
    aud: TEST_AUDIENCE,
    iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
    exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
  };

  return jwt.sign(tokenPayload, TEST_PRIVATE_KEY, {
    algorithm: 'RS256',
  });
}

/**
 * Create a token with invalid signature.
 *
 * @param payload - Token payload
 * @returns JWT signed with wrong key
 */
export function createInvalidSignatureToken(payload: TestTokenPayload): string {
  return createTestToken(payload, { useWrongKey: true });
}

/**
 * Standard test user payload.
 */
export const TEST_USER = {
  sub: 'test-user-id-123',
  email: 'test@example.com',
  roles: ['USER'],
};

/**
 * Admin test user payload.
 */
export const TEST_ADMIN = {
  sub: 'test-admin-id-456',
  email: 'admin@example.com',
  roles: ['ADMIN'],
};
