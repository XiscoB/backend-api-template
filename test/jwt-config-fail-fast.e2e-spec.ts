/*
 * RATCHET: Legacy ESLint violations.
 * These disables exist only for pre-existing code.
 * New code in this file MUST NOT introduce new violations.
 * Fix opportunistically when touching this file.
 */
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
/**
 * JWT Configuration Fail-Fast E2E Tests.
 *
 * Verifies that the application refuses to boot with invalid JWT configuration.
 * These tests protect against silent misconfiguration and ensure operators
 * receive immediate, actionable feedback.
 *
 * Test Strategy:
 * 1. Joi schema tests - Validate that the schema rejects invalid configs
 * 2. JwtStrategy tests - Validate that buildStrategyOptions() fails with clear errors
 * 3. Full bootstrap tests - Validate end-to-end boot failure (where feasible)
 *
 * Coverage:
 * 1. Missing JWT_ISSUER (Joi)
 * 2. Missing signing material (Joi .or() constraint)
 * 3. Algorithm/key mismatch (JwtStrategy)
 * 4. Invalid public key format (JwtStrategy/passport-jwt)
 * 5. Unsupported algorithm (Joi)
 * 6. Empty string values (Joi - after tightening)
 */

import Joi from 'joi';
import { appConfigValidationSchema } from '../src/config/app-config.validation';

/**
 * Helper to create a minimal valid config for testing.
 * Tests will override specific fields to trigger failures.
 */
function createBaseConfig(): Record<string, unknown> {
  return {
    // Required non-JWT config
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/test',

    // Valid JWT config (RS256 with public key)
    JWT_ISSUER: 'https://test.example.com/auth',
    JWT_AUDIENCE: 'test-backend',
    JWT_ALGORITHM: 'RS256',
    JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nMIIBIjAN...\n-----END PUBLIC KEY-----',
  };
}

/**
 * Validate config against Joi schema.
 * Returns validation error if any, or undefined if valid.
 */
function validateConfig(config: Record<string, unknown>): Joi.ValidationError | undefined {
  const { error } = appConfigValidationSchema.validate(config, {
    abortEarly: true,
    allowUnknown: true,
  });
  return error;
}

describe('JWT Configuration Fail-Fast (e2e)', () => {
  // ─────────────────────────────────────────────────────────────
  // Joi Schema Validation Tests
  // ─────────────────────────────────────────────────────────────

  describe('Joi Schema: Missing JWT_ISSUER', () => {
    it('should reject config when JWT_ISSUER is not provided', () => {
      const config = createBaseConfig();
      delete config.JWT_ISSUER;

      const error = validateConfig(config);

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/JWT_ISSUER/i);
    });

    it('should reject config when JWT_ISSUER is not a valid URI', () => {
      const config = createBaseConfig();
      config.JWT_ISSUER = 'not-a-valid-uri';

      const error = validateConfig(config);

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/JWT_ISSUER/i);
      expect(error!.message).toMatch(/valid URL/i);
    });
  });

  describe('Joi Schema: Missing signing material', () => {
    it('should reject config when no signing material is provided (missing all three)', () => {
      const config = createBaseConfig();
      delete config.JWT_SECRET;
      delete config.JWT_PUBLIC_KEY;
      delete config.JWT_JWKS_URI;

      const error = validateConfig(config);

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/JWT_SECRET|JWT_PUBLIC_KEY|JWT_JWKS_URI/i);
    });

    it('should accept config with only JWT_SECRET', () => {
      const config = createBaseConfig();
      delete config.JWT_PUBLIC_KEY;
      delete config.JWT_JWKS_URI;
      config.JWT_SECRET = 'my-secret-key';
      config.JWT_ALGORITHM = 'HS256';

      const error = validateConfig(config);

      expect(error).toBeUndefined();
    });

    it('should accept config with only JWT_PUBLIC_KEY', () => {
      const config = createBaseConfig();
      delete config.JWT_SECRET;
      delete config.JWT_JWKS_URI;
      config.JWT_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMIIBIjAN...\n-----END PUBLIC KEY-----';

      const error = validateConfig(config);

      expect(error).toBeUndefined();
    });

    it('should accept config with only JWT_JWKS_URI', () => {
      const config = createBaseConfig();
      delete config.JWT_SECRET;
      delete config.JWT_PUBLIC_KEY;
      config.JWT_JWKS_URI = 'https://example.com/.well-known/jwks.json';

      const error = validateConfig(config);

      expect(error).toBeUndefined();
    });
  });

  describe('Joi Schema: Unsupported algorithm', () => {
    it('should reject config with unsupported JWT_ALGORITHM (EdDSA)', () => {
      const config = createBaseConfig();
      config.JWT_ALGORITHM = 'EdDSA'; // Not in allowed list

      const error = validateConfig(config);

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/JWT_ALGORITHM/i);
      expect(error!.message).toMatch(/RS256|HS256|ES256/);
    });

    it('should accept ES256 algorithm', () => {
      const config = createBaseConfig();
      config.JWT_ALGORITHM = 'ES256';

      const error = validateConfig(config);

      expect(error).toBeUndefined();
    });

    it('should accept RS256 algorithm', () => {
      const config = createBaseConfig();
      config.JWT_ALGORITHM = 'RS256';

      const error = validateConfig(config);

      expect(error).toBeUndefined();
    });

    it('should accept HS256 algorithm', () => {
      const config = createBaseConfig();
      config.JWT_ALGORITHM = 'HS256';
      config.JWT_SECRET = 'my-secret';
      delete config.JWT_PUBLIC_KEY;
      delete config.JWT_JWKS_URI;

      const error = validateConfig(config);

      expect(error).toBeUndefined();
    });
  });

  describe('Joi Schema: Empty string rejection (tightened validation)', () => {
    it('should reject empty JWT_SECRET (Joi no longer allows empty strings)', () => {
      const config = createBaseConfig();
      config.JWT_SECRET = '';
      delete config.JWT_PUBLIC_KEY;
      delete config.JWT_JWKS_URI;

      const error = validateConfig(config);

      // After tightening, empty string should fail the .or() constraint
      expect(error).toBeDefined();
      expect(error!.message).toMatch(/JWT_SECRET|JWT_PUBLIC_KEY|JWT_JWKS_URI/i);
    });

    it('should reject empty JWT_PUBLIC_KEY (Joi no longer allows empty strings)', () => {
      const config = createBaseConfig();
      config.JWT_PUBLIC_KEY = '';
      delete config.JWT_SECRET;
      delete config.JWT_JWKS_URI;

      const error = validateConfig(config);

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/JWT_SECRET|JWT_PUBLIC_KEY|JWT_JWKS_URI/i);
    });

    it('should reject empty JWT_JWKS_URI (Joi no longer allows empty strings)', () => {
      const config = createBaseConfig();
      config.JWT_JWKS_URI = '';
      delete config.JWT_SECRET;
      delete config.JWT_PUBLIC_KEY;

      const error = validateConfig(config);

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/JWT_SECRET|JWT_PUBLIC_KEY|JWT_JWKS_URI/i);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // JwtStrategy Algorithm/Key Mismatch Tests
  // ─────────────────────────────────────────────────────────────

  describe('JwtStrategy: Algorithm/Key mismatch detection', () => {
    // These tests verify that JwtStrategy construction throws with clear errors
    // for algorithm/key mismatches - enforcing fail-fast at boot time.
    //
    // We import the buildStrategyOptions function indirectly by instantiating
    // JwtStrategy with a mock AppConfigService. The constructor calls
    // buildStrategyOptions() which throws on mismatch.

    /**
     * Helper to create a mock AppConfigService for testing JwtStrategy.
     */
    function createMockAppConfigService(config: {
      jwtIssuer: string;
      jwtAudience: string;
      jwtAlgorithm: 'RS256' | 'HS256';
      jwtSecret?: string;
      jwtPublicKey?: string;
      jwtJwksUri?: string;
      scenarioTestingEnabled?: boolean;
    }) {
      return {
        jwtIssuer: config.jwtIssuer,
        jwtAudience: config.jwtAudience,
        jwtAlgorithm: config.jwtAlgorithm,
        jwtSecret: config.jwtSecret,
        jwtPublicKey: config.jwtPublicKey,
        jwtJwksUri: config.jwtJwksUri,
        scenarioTestingEnabled: config.scenarioTestingEnabled ?? false,
        scenarioTestIssuer: undefined,
        scenarioTestAudience: undefined,
        scenarioTestPublicKey: undefined,
      };
    }

    it('should throw when HS256 is configured but JWT_SECRET is missing', async () => {
      jest.resetModules();

      // Import JwtStrategy fresh
      const { JwtStrategy } = await import('../src/common/auth/jwt.strategy');

      // Create mock with HS256 but no secret (mismatch)
      const mockConfig = createMockAppConfigService({
        jwtIssuer: 'https://test.example.com/auth',
        jwtAudience: 'test-backend',
        jwtAlgorithm: 'HS256',
        jwtPublicKey: '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----',
        // jwtSecret intentionally missing
      });

      // JwtStrategy constructor should throw
      let thrownError: Error | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new JwtStrategy(mockConfig as any);
      } catch (error) {
        thrownError = error as Error;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toMatch(/HS256/);
      expect(thrownError!.message).toMatch(/JWT_SECRET/);
    });

    it('should throw when RS256 is configured but only JWT_SECRET is provided', async () => {
      jest.resetModules();

      const { JwtStrategy } = await import('../src/common/auth/jwt.strategy');

      // Create mock with RS256 but only secret (mismatch)
      const mockConfig = createMockAppConfigService({
        jwtIssuer: 'https://test.example.com/auth',
        jwtAudience: 'test-backend',
        jwtAlgorithm: 'RS256',
        jwtSecret: 'my-symmetric-secret',
        // jwtPublicKey and jwtJwksUri intentionally missing
      });

      // JwtStrategy constructor should throw
      let thrownError: Error | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new JwtStrategy(mockConfig as any);
      } catch (error) {
        thrownError = error as Error;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toMatch(/RS256/);
      expect(thrownError!.message).toMatch(/JWT_SECRET.*provided|not a symmetric secret/i);
    });

    it('should throw when RS256 is configured but no key material is provided', async () => {
      jest.resetModules();

      const { JwtStrategy } = await import('../src/common/auth/jwt.strategy');

      // Create mock with RS256 but no key material at all
      const mockConfig = createMockAppConfigService({
        jwtIssuer: 'https://test.example.com/auth',
        jwtAudience: 'test-backend',
        jwtAlgorithm: 'RS256',
        // No jwtSecret, jwtPublicKey, or jwtJwksUri
      });

      // JwtStrategy constructor should throw
      let thrownError: Error | undefined;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new JwtStrategy(mockConfig as any);
      } catch (error) {
        thrownError = error as Error;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError!.message).toMatch(/RS256/);
      expect(thrownError!.message).toMatch(/JWT_PUBLIC_KEY|JWT_JWKS_URI/);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Full Bootstrap Tests (Integration)
  // ─────────────────────────────────────────────────────────────
  // These tests verify full bootstrap behavior with JWT configuration.

  describe('Full Bootstrap: Invalid public key format', () => {
    /**
     * NOTE: passport-jwt does NOT validate key format at construction time.
     * A malformed key will be accepted at boot and only fail at first request.
     *
     * This test documents that limitation. Boot-time key validation would
     * require adding crypto.createPublicKey() validation in buildStrategyOptions(),
     * which is out of scope for this change.
     *
     * For now, operators must ensure valid PEM keys via deployment validation.
     */
    it('should boot successfully with malformed key (validation deferred to runtime)', async () => {
      const originalEnv = { ...process.env };

      try {
        // Set up complete environment
        process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/backend_test';
        process.env.RATE_LIMIT_DRIVER = 'memory';
        process.env.IN_APP_SCHEDULER_ENABLED = 'false';

        // Clear JWT config
        delete process.env.JWT_SECRET;
        delete process.env.JWT_JWKS_URI;
        delete process.env.SCENARIO_TESTING;

        // Set RS256 with malformed key
        process.env.JWT_ISSUER = 'https://test.example.com/auth';
        process.env.JWT_AUDIENCE = 'test-backend';
        process.env.JWT_ALGORITHM = 'RS256';
        process.env.JWT_PUBLIC_KEY = 'not-a-valid-pem-key-at-all';

        jest.resetModules();

        const { Test } = await import('@nestjs/testing');
        const { AppModule } = await import('../src/app.module');

        // passport-jwt accepts malformed keys at boot (validation deferred)
        // This documents current behavior - the app WILL boot
        const moduleFixture = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();

        expect(moduleFixture).toBeDefined();
        await moduleFixture.close();

        // The malformed key will cause JWT verification to fail at runtime
        // (first request), not at boot. This is a passport-jwt limitation.
      } finally {
        process.env = originalEnv;
      }
    });
  });
});
