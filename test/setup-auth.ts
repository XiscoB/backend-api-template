/**
 * Jest setup for e2e auth tests.
 *
 * Sets environment variables BEFORE any modules are loaded.
 * This ensures the JWT strategy uses our test keys.
 *
 * Tests use SCENARIO_TESTING mode which:
 * - Uses static test keys (same as scripts/scenarios/lib/test-keys.js)
 * - Uses static issuer/audience (scenario-test-issuer, scenario-test-audience)
 * - Bypasses JWKS and JWT_SECRET/JWT_PUBLIC_KEY configuration
 * - Is blocked in production (NODE_ENV=production causes process.exit(1))
 *
 * The test keys match what's hardcoded in app-config.service.ts when
 * SCENARIO_TESTING=true. This avoids any config validation issues with
 * JWT_SECRET/JWT_JWKS_URI from .env files.
 */

import { TEST_PUBLIC_KEY, TEST_PRIVATE_KEY, WRONG_PRIVATE_KEY } from './utils/jwt-test.utils';

// Note: TEST_ISSUER, TEST_AUDIENCE are not used here because scenario testing mode
// hardcodes them in app-config.service.ts. They're available in jwt-test.utils.ts
// for tests that need to create tokens with matching issuer/audience.

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Load .env for infrastructure config (DATABASE_URL, etc.)
// ─────────────────────────────────────────────────────────────────────────────
import * as dotenv from 'dotenv';
dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Enable SCENARIO_TESTING mode
// ─────────────────────────────────────────────────────────────────────────────
// This tells the app to use static test keys instead of JWT_SECRET/JWKS.
// The keys are hardcoded in app-config.service.ts and match jwt-test.utils.ts.
process.env.SCENARIO_TESTING = 'true';

// Scenario testing uses RS256 with static keys
process.env.JWT_ALGORITHM = 'RS256';

// Ensure we're not in production (scenario testing is blocked in prod)
if (process.env.NODE_ENV === 'production') {
  throw new Error('E2E tests cannot run with NODE_ENV=production');
}

// Configure test database
{
  const baseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error(
      'Missing DATABASE_URL (or TEST_DATABASE_URL) for tests. Provide a PostgreSQL connection URL.',
    );
  }

  try {
    const url = new URL(baseUrl);
    url.pathname = '/backend_test';
    process.env.DATABASE_URL = url.toString();
  } catch {
    throw new Error('Invalid DATABASE_URL (or TEST_DATABASE_URL) format for tests.');
  }
}

// Disable Redis and Scheduler for tests
process.env.RATE_LIMIT_DRIVER = 'memory';
process.env.IN_APP_SCHEDULER_ENABLED = 'false';

// Export the keys for use in tests (Re-exporting from source)
export { TEST_PUBLIC_KEY, TEST_PRIVATE_KEY, WRONG_PRIVATE_KEY };
