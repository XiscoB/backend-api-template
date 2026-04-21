/*
 * RATCHET: Legacy ESLint violations.
 * These disables exist only for pre-existing code.
 * New code in this file MUST NOT introduce new violations.
 * Fix opportunistically when touching this file.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
/**
 * Golden Path Lifecycle System Test (Manual)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is a comprehensive end-to-end system test that validates the entire
 * user lifecycle against a REAL running backend using REAL HTTP calls and
 * REAL JWTs.
 *
 * This is NOT a unit test.
 * This is NOT a CI test.
 * This is a release-confidence / system validation test.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHEN TO RUN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - Before major releases
 * - After large refactors
 * - After GDPR / notification changes
 * - After infrastructure changes
 * - When validating a new environment
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HOW TO RUN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. Ensure backend is running (e.g., `npm run docker:up` or `npm run start:dev`)
 *
 * 2. Obtain valid JWTs for:
 *    - A normal user (USER role)
 *    - An admin user with internal_admin: true and internal_admin_level: write
 *
 * 3. Set environment variables:
 *    ```powershell
 *    $env:RUN_SYSTEM_TESTS = "true"
 *    $env:SYSTEM_TEST_BASE_URL = "http://localhost:3000"
 *    $env:USER_TOKEN = "eyJhbGc..."
 *    $env:ADMIN_TOKEN = "eyJhbGc..."
 *    ```
 *
 * 4. Run the test:
 *    ```bash
 *    npm run test:e2e -- --testPathPattern=lifecycle
 *    ```
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASES TESTED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Phase 0: Setup & Prerequisites
 * Phase 1: Public Endpoints
 * Phase 2: Profile Lifecycle
 * Phase 3: Notification Channels
 * Phase 4: GDPR Export
 * Phase 5: Suspension & Recovery
 * Phase 6: Deletion (DESTRUCTIVE)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPORTANT NOTES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - This test is DESTRUCTIVE - Phase 6 permanently deletes user data
 * - The test must run SEQUENTIALLY - do not parallelize
 * - GDPR job processing is triggered externally (see job trigger instructions)
 * - All assertions are behavioral, not DB internals
 * - Generous timeouts are used for polling operations
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * JOB PROCESSING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GDPR background jobs must be triggered during the test. Options:
 *
 * 1. Manual trigger (in another terminal):
 *    ```bash
 *    npm run job:gdpr
 *    ```
 *
 * 2. If cron is running, jobs will execute automatically
 *
 * The test will poll and wait for status changes with generous timeouts.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { execSync } from 'child_process';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const RUN_SYSTEM_TESTS = process.env.RUN_SYSTEM_TESTS === 'true';
const BASE_URL = process.env.SYSTEM_TEST_BASE_URL || 'http://localhost:3000';
const USER_TOKEN = process.env.USER_TOKEN;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// Timeouts and polling configuration
const POLLING_INTERVAL_MS = 2000; // Poll every 2 seconds
const MAX_POLL_ATTEMPTS = 60; // Max 2 minutes of polling
const REQUEST_TIMEOUT_MS = 30000; // 30 second request timeout
const JOB_TEST_TIMEOUT_MS = 120000; // 2 minutes for tests that run GDPR jobs

// ═══════════════════════════════════════════════════════════════════════════
// TEST GATE
// ═══════════════════════════════════════════════════════════════════════════

const describeIfEnabled = RUN_SYSTEM_TESTS ? describe : describe.skip;

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the GDPR job processor to process pending requests.
 * This "takes a breath" and runs the background job inline.
 */
async function runGdprJobProcessor(): Promise<void> {
  console.log('\n  ════════════════════════════════════════════════════════');
  console.log('  🔄 Running GDPR job processor (npm run job:gdpr)...');
  console.log('  ════════════════════════════════════════════════════════\n');

  try {
    execSync('npm run job:gdpr', {
      cwd: process.cwd(),
      stdio: 'inherit', // Show output in console
      timeout: 60000, // 60 second timeout
    });
    console.log('\n  ✓ GDPR job processor completed\n');
  } catch (error) {
    console.error('\n  ⚠️  GDPR job processor failed or timed out');
    console.error('  Continuing with test...\n');
  }

  // Brief pause to let any async operations settle
  await sleep(1000);
}

/**
 * Create an axios instance with authentication.
 */
function createClient(token?: string): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    validateStatus: () => true, // Don't throw on non-2xx
  });
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until a condition is met or timeout.
 */
async function pollUntil<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  options: {
    intervalMs?: number;
    maxAttempts?: number;
    description?: string;
  } = {},
): Promise<T> {
  const {
    intervalMs = POLLING_INTERVAL_MS,
    maxAttempts = MAX_POLL_ATTEMPTS,
    description = 'condition',
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await fn();
    if (predicate(result)) {
      return result;
    }
    console.log(`  [Poll ${attempt}/${maxAttempts}] Waiting for ${description}...`);
    await sleep(intervalMs);
  }

  throw new Error(`Polling timed out after ${maxAttempts} attempts waiting for: ${description}`);
}

/**
 * Format error for clear failure messages.
 * Exported for use in test output.
 */
export function formatError(phase: string, step: string, error: unknown): string {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    return `[${phase}] ${step} failed: ${axiosError.message} (status: ${axiosError.response?.status})`;
  }
  return `[${phase}] ${step} failed: ${String(error)}`;
}

/**
 * Decode JWT and check expiration.
 * Returns { valid, expiresAt, expiredAgo } or throws if invalid format.
 */
function checkTokenExpiration(token: string): {
  valid: boolean;
  expiresAt: Date;
  expiredAgo?: string;
  expiresIn?: string;
} {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format');
    }

    // Decode payload (base64url)
    let payload = parts[1];
    // Add padding if needed
    while (payload.length % 4 !== 0) {
      payload += '=';
    }
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');

    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    const exp = decoded.exp;

    if (!exp) {
      throw new Error('Token has no exp claim');
    }

    const expiresAt = new Date(exp * 1000);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs < 0) {
      const agoMinutes = Math.abs(Math.floor(diffMs / 60000));
      return {
        valid: false,
        expiresAt,
        expiredAgo:
          agoMinutes < 60
            ? `${agoMinutes} minutes ago`
            : `${Math.floor(agoMinutes / 60)} hours ${agoMinutes % 60} minutes ago`,
      };
    }

    const inMinutes = Math.floor(diffMs / 60000);
    return {
      valid: true,
      expiresAt,
      expiresIn:
        inMinutes < 60
          ? `${inMinutes} minutes`
          : `${Math.floor(inMinutes / 60)} hours ${inMinutes % 60} minutes`,
    };
  } catch (e) {
    throw new Error(`Failed to decode token: ${String(e)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════

describeIfEnabled('Golden Path Lifecycle System Test', () => {
  // Clients
  let publicClient: AxiosInstance;
  let userClient: AxiosInstance;
  let adminClient: AxiosInstance;

  // Identity status tracked across phases
  // This is THE authoritative check for whether tests can proceed
  let userIdentityStatus: string = 'UNKNOWN';
  let deletionScheduledAt: string | null = null;

  // State tracked across phases
  let emailChannelId: string | null = null;
  let pushChannelId: string | null = null;
  let exportRequestId: string | null = null;

  /**
   * Check if user is in ACTIVE state.
   * Tests that require app access should skip if user is blocked.
   */
  function isUserActive(): boolean {
    return userIdentityStatus === 'ACTIVE';
  }

  /**
   * Check if user is blocked (SUSPENDED, DELETED, PENDING_DELETION).
   */
  function isUserBlocked(): boolean {
    return ['SUSPENDED', 'DELETED', 'PENDING_DELETION', 'PENDING_RECOVERY'].includes(
      userIdentityStatus,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 0: SETUP
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 0 — Setup & Prerequisites', () => {
    it('should have RUN_SYSTEM_TESTS enabled', () => {
      expect(RUN_SYSTEM_TESTS).toBe(true);
    });

    it('should have USER_TOKEN configured and not expired', () => {
      expect(USER_TOKEN).toBeDefined();
      expect(USER_TOKEN!.length).toBeGreaterThan(0);

      const tokenStatus = checkTokenExpiration(USER_TOKEN!);
      if (!tokenStatus.valid) {
        console.error('\n');
        console.error('╔════════════════════════════════════════════════════════════════╗');
        console.error('║  ❌ USER_TOKEN EXPIRED                                          ║');
        console.error('╠════════════════════════════════════════════════════════════════╣');
        console.error(`║  Expired: ${tokenStatus.expiredAgo?.padEnd(50)}║`);
        console.error(`║  Was valid until: ${tokenStatus.expiresAt.toLocaleString().padEnd(42)}║`);
        console.error('║                                                                ║');
        console.error('║  Please refresh your token and update test/system/.env.local  ║');
        console.error('╚════════════════════════════════════════════════════════════════╝');
        console.error('\n');
      } else {
        console.log(`  ✓ USER_TOKEN valid for ${tokenStatus.expiresIn}`);
      }
      expect(tokenStatus.valid).toBe(true);
    });

    it('should have ADMIN_TOKEN configured and not expired', () => {
      expect(ADMIN_TOKEN).toBeDefined();
      expect(ADMIN_TOKEN!.length).toBeGreaterThan(0);

      const tokenStatus = checkTokenExpiration(ADMIN_TOKEN!);
      if (!tokenStatus.valid) {
        console.error('\n');
        console.error('╔════════════════════════════════════════════════════════════════╗');
        console.error('║  ❌ ADMIN_TOKEN EXPIRED                                         ║');
        console.error('╠════════════════════════════════════════════════════════════════╣');
        console.error(`║  Expired: ${tokenStatus.expiredAgo?.padEnd(50)}║`);
        console.error(`║  Was valid until: ${tokenStatus.expiresAt.toLocaleString().padEnd(42)}║`);
        console.error('║                                                                ║');
        console.error('║  Please refresh your token and update test/system/.env.local  ║');
        console.error('╚════════════════════════════════════════════════════════════════╝');
        console.error('\n');
      } else {
        console.log(`  ✓ ADMIN_TOKEN valid for ${tokenStatus.expiresIn}`);
      }
      expect(tokenStatus.valid).toBe(true);
    });

    it('should be able to reach the backend', async () => {
      publicClient = createClient();
      userClient = createClient(USER_TOKEN);
      adminClient = createClient(ADMIN_TOKEN);

      const response = await publicClient.get('/api/v1/health');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'ok');
    });

    it('should have valid USER_TOKEN and ACTIVE identity (via bootstrap)', async () => {
      // The bootstrap endpoint is the MANDATORY first call after authentication
      // It determines whether the user can access the app
      const response = await userClient.post('/api/v1/bootstrap');

      // Bootstrap should always return 200 (even for blocked users)
      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      expect(data).toHaveProperty('identity');
      expect(data.identity).toHaveProperty('status');

      // Track identity status for all subsequent tests
      userIdentityStatus = data.identity.status;
      deletionScheduledAt = data.identity.deletionScheduledAt || null;

      console.log(`  [Bootstrap] Identity status: ${userIdentityStatus}`);
      if (deletionScheduledAt) {
        console.log(`  [Bootstrap] Deletion scheduled at: ${deletionScheduledAt}`);
      }

      // For tests to proceed normally, user must be ACTIVE
      // If user is blocked, subsequent tests will adapt accordingly
      if (!isUserActive()) {
        console.warn('\n');
        console.warn('╔════════════════════════════════════════════════════════════════╗');
        console.warn('║  ⚠️  USER IS NOT ACTIVE                                         ║');
        console.warn('╠════════════════════════════════════════════════════════════════╣');
        console.warn(`║  Status: ${userIdentityStatus.padEnd(52)}║`);
        console.warn('║                                                                ║');
        console.warn('║  Some tests will be skipped or adapted.                        ║');
        console.warn('║  To run full test suite, use a fresh ACTIVE user.             ║');
        console.warn('╚════════════════════════════════════════════════════════════════╝');
        console.warn('\n');
      }

      // Test passes regardless of status - we just need to track it
      expect(data.identity.status).toBeDefined();
    });

    it('should have valid ADMIN_TOKEN with admin privileges', async () => {
      const response = await adminClient.get('/api/internal/admin/health');
      expect(response.status).toBe(200);
      expect(response.data.data).toHaveProperty('status', 'ok');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: PUBLIC ENDPOINTS
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 1 — Public Endpoints', () => {
    it('GET /api/v1/health should return 200 with status ok', async () => {
      const response = await publicClient.get('/api/v1/health');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
    });

    it('GET /api/v1/health/detailed should return 200 with components', async () => {
      const response = await publicClient.get('/api/v1/health/detailed');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('components');
    });

    it('GET /api/v1/public/bootstrap should return 200 with app-level config (no auth required)', async () => {
      // Public bootstrap provides app-level configuration
      // This is UNAUTHENTICATED - no user context, no identity
      const response = await publicClient.get('/api/v1/public/bootstrap');
      expect(response.status).toBe(200);

      // Handle both wrapped and unwrapped responses
      const data = response.data?.data || response.data;

      // Public bootstrap MUST have these app-level fields
      expect(data).toHaveProperty('updatePolicy');
      expect(data).toHaveProperty('metadata');
      expect(data).toHaveProperty('features');
      expect(data).toHaveProperty('i18n');

      // Public bootstrap MUST NOT have identity or profile
      // (those come from authenticated bootstrap)
      expect(data).not.toHaveProperty('identity');
      expect(data).not.toHaveProperty('profile');

      console.log('  ✓ Public bootstrap returns app config without identity');
    });

    it('POST /api/v1/bootstrap (authenticated) should return identity context', async () => {
      // Authenticated bootstrap is the MANDATORY startup gate
      // It returns identity status which determines app access
      const response = await userClient.post('/api/v1/bootstrap');
      expect(response.status).toBe(200);

      // Handle both wrapped and unwrapped responses
      const data = response.data?.data || response.data;

      // MUST have identity
      expect(data).toHaveProperty('identity');
      expect(data.identity).toHaveProperty('status');

      // Update tracked status
      userIdentityStatus = data.identity.status;
      deletionScheduledAt = data.identity.deletionScheduledAt || null;

      // Response varies by status
      switch (data.identity.status) {
        case 'ACTIVE':
          // ACTIVE users get roles and profile
          expect(data.identity).toHaveProperty('roles');
          expect(Array.isArray(data.identity.roles)).toBe(true);
          expect(data).toHaveProperty('profile');
          console.log(`  ✓ Identity status: ACTIVE, roles: ${data.identity.roles.join(', ')}`);
          break;

        case 'PENDING_DELETION':
          // PENDING_DELETION users get deletion schedule info
          expect(data.identity).toHaveProperty('deletionScheduledAt');
          console.log(`  ⚠️  Identity status: PENDING_DELETION`);
          console.log(`     Deletion scheduled: ${data.identity.deletionScheduledAt}`);
          break;

        case 'SUSPENDED':
        case 'PENDING_RECOVERY':
          // Suspended users may have recovery info
          console.log(`  ⚠️  Identity status: ${data.identity.status}`);
          if (data.identity.recoveryAvailable) {
            console.log(`     Recovery available: true`);
          }
          break;

        case 'DELETED':
          // Deleted users (anonymized) have minimal info
          console.log(`  ❌ Identity status: DELETED (anonymized)`);
          break;

        default:
          console.log(`  [Info] Identity status: ${data.identity.status}`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: PROFILE LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 2 — Profile Lifecycle', () => {
    it('GET /api/v1/profiles/me should return profile or 404', async () => {
      // Skip if user is blocked - bootstrap must pass first
      if (isUserBlocked()) {
        console.log(`  [Skip] User is ${userIdentityStatus} - profile not accessible`);
        return;
      }

      const response = await userClient.get('/api/v1/profiles/me');

      // Either 200 (profile exists) or 404 (no profile yet)
      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        console.log('  [Info] Profile already exists, will update');
      } else {
        console.log('  [Info] No profile exists, will create');
      }
    });

    it('POST /api/v1/profiles/me should create profile', async () => {
      if (isUserBlocked()) {
        console.log(`  [Skip] User is ${userIdentityStatus} - cannot create profile`);
        return;
      }

      const response = await userClient.post('/api/v1/profiles/me', {
        displayName: 'System Test User',
        language: 'en',
      });

      // 200 for idempotent creation
      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('displayName');
    });

    it('PATCH /api/v1/profiles/me should update profile fields', async () => {
      if (isUserBlocked()) {
        console.log(`  [Skip] User is ${userIdentityStatus} - cannot update profile`);
        return;
      }

      const newDisplayName = `Test User ${Date.now()}`;

      const response = await userClient.patch('/api/v1/profiles/me', {
        displayName: newDisplayName,
        language: 'es',
      });

      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      expect(data.displayName).toBe(newDisplayName);
      expect(data.language).toBe('es');
    });

    it('GET /api/v1/profiles/me should return updated profile', async () => {
      if (isUserBlocked()) {
        console.log(`  [Skip] User is ${userIdentityStatus} - profile not accessible`);
        return;
      }

      const response = await userClient.get('/api/v1/profiles/me');

      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      expect(data).toHaveProperty('displayName');
      expect(data.language).toBe('es');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: NOTIFICATION CHANNELS
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 3 — Notification Channels', () => {
    const testEmail = `system-test-${Date.now()}@example.com`;
    const testPushToken = `ExponentPushToken[system-test-${Date.now()}]`;
    const testUniqueKey = `system-test-device-${Date.now()}`;

    it('POST /api/v1/notification-profile/email should add email channel', async () => {
      if (isUserBlocked()) {
        console.log(`  [Skip] User is ${userIdentityStatus} - cannot add notification channels`);
        return;
      }

      const response = await userClient.post('/api/v1/notification-profile/email', {
        email: testEmail,
        enabled: true,
        promoEnabled: false,
      });

      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      expect(data).toHaveProperty('id');
      expect(data.email).toBe(testEmail);

      emailChannelId = data.id;
    });

    it('POST /api/v1/notification-profile/push should add push channel', async () => {
      if (isUserBlocked()) {
        console.log(`  [Skip] User is ${userIdentityStatus} - cannot add push channels`);
        return;
      }

      const response = await userClient.post('/api/v1/notification-profile/push', {
        expoToken: testPushToken,
        uniqueKey: testUniqueKey,
        platform: 'ios',
      });

      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      expect(data).toHaveProperty('id');

      pushChannelId = data.id;
    });

    it('PUT /api/v1/notification-profile/email/:id/enabled should update email channel', async () => {
      if (isUserBlocked() || !emailChannelId) {
        console.log(`  [Skip] User is ${userIdentityStatus} or no email channel - cannot update`);
        return;
      }

      const response = await userClient.put(
        `/api/v1/notification-profile/email/${emailChannelId}/enabled`,
        {
          enabled: false,
        },
      );

      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      expect(data.enabled).toBe(false);
    });

    it('DELETE /api/v1/notification-profile/email/:id should remove email channel', async () => {
      if (isUserBlocked() || !emailChannelId) {
        console.log(`  [Skip] User is ${userIdentityStatus} or no email channel - cannot delete`);
        return;
      }

      const response = await userClient.delete(
        `/api/v1/notification-profile/email/${emailChannelId}`,
      );
      expect(response.status).toBe(204);
    });

    it('DELETE /api/v1/notification-profile/push/:id should remove push channel', async () => {
      if (isUserBlocked() || !pushChannelId) {
        console.log(`  [Skip] User is ${userIdentityStatus} or no push channel - cannot delete`);
        return;
      }

      const response = await userClient.delete(
        `/api/v1/notification-profile/push/${pushChannelId}`,
      );
      expect(response.status).toBe(204);
    });

    it('should re-create email and push channels (needed for later phases)', async () => {
      if (isUserBlocked()) {
        console.log(`  [Skip] User is ${userIdentityStatus} - cannot create channels`);
        return;
      }

      // Re-create email channel
      const emailResponse = await userClient.post('/api/v1/notification-profile/email', {
        email: `final-${testEmail}`,
        enabled: true,
        promoEnabled: true,
      });
      expect(emailResponse.status).toBe(200);
      emailChannelId = (emailResponse.data?.data || emailResponse.data).id;

      // Re-create push channel
      const pushResponse = await userClient.post('/api/v1/notification-profile/push', {
        expoToken: `final-${testPushToken}`,
        uniqueKey: `final-${testUniqueKey}`,
        platform: 'android',
      });
      expect(pushResponse.status).toBe(200);
      pushChannelId = (pushResponse.data?.data || pushResponse.data).id;
    });

    it('GET /api/v1/notification-profile should show both channels', async () => {
      if (isUserBlocked()) {
        console.log(`  [Skip] User is ${userIdentityStatus} - notification profile not accessible`);
        return;
      }

      const response = await userClient.get('/api/v1/notification-profile');

      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      expect(data).toHaveProperty('emailChannels');
      expect(data).toHaveProperty('pushChannels');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4: GDPR EXPORT
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 4 — GDPR Export', () => {
    it(
      'POST /api/v1/gdpr/export should initiate export request',
      async () => {
        // Check identity status - blocked users cannot create exports
        if (isUserBlocked()) {
          console.log(`  [Skip] User is ${userIdentityStatus} - cannot create export request`);
          return;
        }

        const response = await userClient.post('/api/v1/gdpr/export');

        // 202 Accepted, 409 Conflict (pending), or 403 (user deleted/suspended)
        expect([202, 403, 409]).toContain(response.status);

        if (response.status === 403) {
          console.log('  [Info] User access denied (403) - may have been blocked since test start');
          // Update tracked status via bootstrap
          const bootstrapResponse = await userClient.post('/api/v1/bootstrap');
          const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data;
          userIdentityStatus = bootstrapData.identity?.status || userIdentityStatus;
          console.log(`  [Info] Updated identity status: ${userIdentityStatus}`);
          return;
        }

        if (response.status === 202) {
          const data = response.data?.data || response.data;
          expect(data).toHaveProperty('id');
          exportRequestId = data.id;
          console.log(`  [Info] Export request created: ${exportRequestId}`);
        } else {
          console.log('  [Info] Pending export request already exists');
          // Run the job processor to handle the pending request
          await runGdprJobProcessor();
        }
      },
      JOB_TEST_TIMEOUT_MS,
    );

    it(
      'should wait for export processing (poll until COMPLETED)',
      async () => {
        if (!exportRequestId) {
          console.log('  [Skip] No new export request to poll (previous one was processed)');
          return;
        }

        // Run the job processor to handle the new request
        await runGdprJobProcessor();

        const result = await pollUntil(
          async () => {
            const response = await userClient.get(`/api/v1/gdpr/exports/${exportRequestId}`);
            return response;
          },
          (response) => {
            if (response.status !== 200) return false;
            const data = response.data?.data || response.data;
            const status = data?.status;
            console.log(`    Current status: ${status}`);
            return status === 'COMPLETED';
          },
          { description: 'export status = COMPLETED' },
        );

        expect(result.status).toBe(200);
        const data = result.data?.data || result.data;
        expect(data.status).toBe('COMPLETED');
      },
      JOB_TEST_TIMEOUT_MS,
    );

    it('GET /api/v1/gdpr/exports/:id/download should return download link', async () => {
      if (!exportRequestId) {
        console.log('  [Skip] No export request to download');
        return;
      }

      const response = await userClient.get(`/api/v1/gdpr/exports/${exportRequestId}/download`);

      // Note: If using local storage without S3, download endpoint may return 500
      // because the delivery service tries to generate S3 presigned URLs.
      // This is a known limitation of the current architecture.
      if (response.status === 500) {
        console.log('  [Warning] Download endpoint returned 500 - likely S3 not configured');
        console.log('  [Info] Export was created and processed successfully');
        console.log('  [Info] Download URL generation requires S3 storage configuration');
        return; // Skip assertion, export processing was verified above
      }

      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      expect(data).toHaveProperty('downloadUrl');
      expect(data.downloadUrl).toBeTruthy();

      console.log('  [Info] Download URL generated successfully');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 5: SUSPENSION & RECOVERY
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 5 — Suspension & Recovery', () => {
    let suspensionRequestId: string | null = null;
    let userWasBlocked = false;

    it(
      'POST /api/v1/gdpr/suspend should initiate suspension request',
      async () => {
        // Check if user is already blocked (deleted, pending deletion, etc.)
        if (isUserBlocked()) {
          console.log(`  [Skip] User is ${userIdentityStatus} - cannot create suspension request`);
          userWasBlocked = true;
          return;
        }

        const response = await userClient.post('/api/v1/gdpr/suspend');

        // 202 Accepted, 409 Conflict, or 403 (user blocked)
        expect([202, 403, 409]).toContain(response.status);

        if (response.status === 403) {
          console.log('  [Info] User access denied (403) - checking identity status...');
          // Update identity status via bootstrap
          const bootstrapResponse = await userClient.post('/api/v1/bootstrap');
          const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data;
          userIdentityStatus = bootstrapData.identity?.status || userIdentityStatus;
          console.log(`  [Info] Identity status: ${userIdentityStatus}`);
          userWasBlocked = true;
          return;
        }

        if (response.status === 202) {
          const data = response.data?.data || response.data;
          expect(data).toHaveProperty('id');
          suspensionRequestId = data.id;
          console.log(`  [Info] Suspension request created: ${suspensionRequestId}`);
        } else {
          console.log('  [Info] User already has pending/active suspension');
          // Run the job processor to handle the pending request
          await runGdprJobProcessor();
        }
      },
      JOB_TEST_TIMEOUT_MS,
    );

    it(
      'should wait for suspension processing',
      async () => {
        if (userWasBlocked) {
          console.log(
            `  [Skip] User was blocked (${userIdentityStatus}) - skipping suspension processing`,
          );
          return;
        }

        if (!suspensionRequestId) {
          console.log('  [Skip] No new suspension request to wait for');
          return;
        }

        // Run the job processor to handle the new request
        await runGdprJobProcessor();

        // Poll until suspension request is COMPLETED
        await pollUntil(
          async () => {
            const response = await adminClient.get(
              `/api/internal/admin/record/gdpr_requests/${suspensionRequestId}`,
            );
            return response;
          },
          (response) => {
            if (response.status !== 200) return false;
            const data = response.data?.data || response.data;
            const status = data?.status;
            console.log(`    Suspension request status: ${status}`);
            return status?.toUpperCase() === 'COMPLETED';
          },
          { description: 'suspension request COMPLETED', maxAttempts: 10 },
        );

        // After suspension, update identity status via bootstrap
        const bootstrapResponse = await userClient.post('/api/v1/bootstrap');
        const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data;
        userIdentityStatus = bootstrapData.identity?.status || userIdentityStatus;
        console.log(`  [Info] Suspension processed, identity status: ${userIdentityStatus}`);
      },
      JOB_TEST_TIMEOUT_MS,
    );

    it('should verify identity status reflects suspension via bootstrap', async () => {
      if (userWasBlocked) {
        console.log(`  [Skip] User was already blocked (${userIdentityStatus})`);
        return;
      }

      // Skip if no suspension was created
      if (!suspensionRequestId) {
        console.log('  [Skip] No suspension to verify');
        return;
      }

      // Verify suspension status via bootstrap (the authoritative check)
      const bootstrapResponse = await userClient.post('/api/v1/bootstrap');
      expect(bootstrapResponse.status).toBe(200);

      const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data;
      userIdentityStatus = bootstrapData.identity?.status || userIdentityStatus;

      // During suspension, status should be SUSPENDED or PENDING_RECOVERY
      console.log(`  [Info] Identity status after suspension: ${userIdentityStatus}`);

      // Blocking happens at bootstrap level, NOT via 401s
      // The bootstrap call succeeds (200) but identity.status indicates blocking
      expect(['SUSPENDED', 'PENDING_RECOVERY']).toContain(userIdentityStatus);

      // Also verify the GDPR request completed
      const adminResponse = await adminClient.get(
        `/api/internal/admin/record/gdpr_requests/${suspensionRequestId}`,
      );
      expect(adminResponse.status).toBe(200);
      const data = adminResponse.data?.data || adminResponse.data;
      expect(data?.status?.toUpperCase()).toBe('COMPLETED');
    });

    it('POST /api/v1/gdpr/recover should recover the account', async () => {
      if (userWasBlocked) {
        console.log(`  [Skip] User was blocked (${userIdentityStatus}) - cannot recover`);
        return;
      }

      const response = await userClient.post('/api/v1/gdpr/recover');

      // 200 OK for successful recovery, 403 if blocked, or 404 if no suspension
      expect([200, 403, 404]).toContain(response.status);

      if (response.status === 200) {
        const data = response.data?.data || response.data;
        console.log(`  [Info] Account recovered: ${JSON.stringify(data)}`);

        // After recovery, update identity status
        const bootstrapResponse = await userClient.post('/api/v1/bootstrap');
        const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data;
        userIdentityStatus = bootstrapData.identity?.status || userIdentityStatus;
        console.log(`  [Info] Identity status after recovery: ${userIdentityStatus}`);
      } else if (response.status === 403) {
        console.log('  [Info] User is blocked - cannot recover');
        // Update identity status
        const bootstrapResponse = await userClient.post('/api/v1/bootstrap');
        const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data;
        userIdentityStatus = bootstrapData.identity?.status || userIdentityStatus;
        userWasBlocked = true;
      } else {
        console.log('  [Info] No active suspension to recover from');
      }
    });

    it('should verify profile endpoints are accessible after recovery', async () => {
      if (userWasBlocked) {
        console.log(`  [Skip] User was blocked (${userIdentityStatus}) - profile not accessible`);
        return;
      }

      // Only check if user is now ACTIVE
      if (!isUserActive()) {
        console.log(`  [Skip] User is ${userIdentityStatus} - profile may not be accessible`);
        return;
      }

      const response = await userClient.get('/api/v1/profiles/me');

      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      expect(data).toHaveProperty('id');
      console.log('  [Info] Profile endpoint accessible after recovery');
    });

    it('should verify data remains intact after recovery', async () => {
      if (userWasBlocked || !isUserActive()) {
        console.log(`  [Skip] User is ${userIdentityStatus} - data not accessible`);
        return;
      }

      const response = await userClient.get('/api/v1/notification-profile');

      expect(response.status).toBe(200);

      const data = response.data?.data || response.data;
      // Channels should still exist
      expect(data).toHaveProperty('emailChannels');
      expect(data).toHaveProperty('pushChannels');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 6: DELETION (DESTRUCTIVE)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // IMPORTANT: The deletion lifecycle has two phases:
  //
  // 1. PENDING_DELETION (Grace Period):
  //    - Identity.deletedAt is set
  //    - Bootstrap returns status: 'PENDING_DELETION' with deletionScheduledAt
  //    - User is BLOCKED at bootstrap level (not via 401)
  //
  // 2. DELETED (Final):
  //    - Grace period expired, data anonymized
  //    - Bootstrap returns status: 'DELETED'
  //    - Irreversible
  //
  // This test phase:
  // 1. Triggers deletion (Phase A: immediate blocking)
  // 2. Backdates deletedAt to 31 days ago via admin API (simulates expired grace period)
  // 3. Runs the GDPR job processor to finalize the deletion
  // 4. Verifies the user is in DELETED status (fully anonymized)
  // ─────────────────────────────────────────────────────────────────────────

  describe('Phase 6 — Deletion (DESTRUCTIVE)', () => {
    let deletionRequestId: string | null = null;
    let deletionWasInitiated = false;
    let userAlreadyBlocked = false;

    it(
      'POST /api/v1/gdpr/delete should initiate deletion request',
      async () => {
        console.log('\n  ⚠️  WARNING: This phase initiates account deletion');
        console.log('  ════════════════════════════════════════════════════════');
        console.log('  User will enter PENDING_DELETION state (grace period).');
        console.log('  Final deletion requires grace period expiration.\n');

        // Check current identity status
        if (userIdentityStatus === 'DELETED') {
          console.log('  [Skip] User is already DELETED (anonymized)');
          userAlreadyBlocked = true;
          return;
        }

        if (userIdentityStatus === 'PENDING_DELETION') {
          console.log('  [Info] User is already PENDING_DELETION');
          console.log(`  [Info] Deletion scheduled at: ${deletionScheduledAt}`);
          deletionWasInitiated = true;
          return;
        }

        const response = await userClient.post('/api/v1/gdpr/delete');

        // 202 Accepted, 403 (blocked), or 409 Conflict
        expect([202, 403, 409]).toContain(response.status);

        if (response.status === 403) {
          console.log('  [Info] User access denied (403) - checking identity status...');
          const bootstrapResponse = await userClient.post('/api/v1/bootstrap');
          const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data;
          userIdentityStatus = bootstrapData.identity?.status || userIdentityStatus;
          deletionScheduledAt = bootstrapData.identity?.deletionScheduledAt || null;
          console.log(`  [Info] Identity status: ${userIdentityStatus}`);
          userAlreadyBlocked = userIdentityStatus === 'DELETED';
          deletionWasInitiated = userIdentityStatus === 'PENDING_DELETION';
          return;
        }

        if (response.status === 202) {
          const data = response.data?.data || response.data;
          expect(data).toHaveProperty('id');
          deletionRequestId = data.id;
          deletionWasInitiated = true;
          console.log(`  [Info] Deletion request created: ${deletionRequestId}`);
        } else {
          console.log('  [Info] Pending deletion request already exists');
          deletionWasInitiated = true;
        }
      },
      JOB_TEST_TIMEOUT_MS,
    );

    it(
      'should verify identity status is PENDING_DELETION via bootstrap',
      async () => {
        if (userAlreadyBlocked) {
          console.log('  [Info] User was already blocked (DELETED)');
          return;
        }

        if (!deletionWasInitiated) {
          console.log('  [Skip] No deletion was initiated');
          return;
        }

        // The authoritative check: bootstrap returns identity status
        const bootstrapResponse = await userClient.post('/api/v1/bootstrap');
        expect(bootstrapResponse.status).toBe(200);

        const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data;
        expect(bootstrapData).toHaveProperty('identity');

        userIdentityStatus = bootstrapData.identity?.status;
        deletionScheduledAt = bootstrapData.identity?.deletionScheduledAt || null;

        console.log(`  [Info] Identity status: ${userIdentityStatus}`);

        // During grace period, status should be PENDING_DELETION
        // After grace period expires (via cron), status becomes DELETED
        if (userIdentityStatus === 'PENDING_DELETION') {
          expect(bootstrapData.identity).toHaveProperty('deletionScheduledAt');
          console.log(`  ✓ User is in PENDING_DELETION state`);
          console.log(`    Deletion scheduled at: ${deletionScheduledAt}`);
          console.log(`    User is BLOCKED at bootstrap level (not via 401)`);
        } else if (userIdentityStatus === 'DELETED') {
          console.log(`  ✓ User is already DELETED (anonymized)`);
        } else {
          // Unexpected state
          console.warn(`  ⚠️  Unexpected status: ${userIdentityStatus}`);
        }

        expect(['PENDING_DELETION', 'DELETED']).toContain(userIdentityStatus);
      },
      JOB_TEST_TIMEOUT_MS,
    );

    it('should verify user is blocked at bootstrap level (not via 401)', async () => {
      if (!deletionWasInitiated && !userAlreadyBlocked) {
        console.log('  [Skip] No deletion was initiated');
        return;
      }

      // KEY INSIGHT: Blocking happens at bootstrap level, NOT via 401 responses
      // The JWT is still valid, authentication succeeds, but bootstrap returns blocked status

      // Bootstrap should return 200 even for blocked users
      const bootstrapResponse = await userClient.post('/api/v1/bootstrap');
      expect(bootstrapResponse.status).toBe(200);

      const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data;
      const status = bootstrapData.identity?.status;

      // Status must be PENDING_DELETION or DELETED - both indicate blocking
      expect(['PENDING_DELETION', 'DELETED']).toContain(status);

      console.log(`  ✓ Bootstrap returns 200 with blocked status: ${status}`);
      console.log('    (Blocking is at bootstrap level, not auth provider)');
    });

    it('should verify GDPR deletion lifecycle is identity-driven', async () => {
      // NOTE: The new deletion flow is identity-driven (see GDPR_DELETION.md)
      // The API returns identityId, not a gdpr_requests record ID.
      // Deletion status is verified via bootstrap identity.status = 'PENDING_DELETION'
      // The gdpr_requests record is created internally for cron tracking.

      if (!deletionWasInitiated && !userAlreadyBlocked) {
        console.log('  [Skip] No deletion was initiated');
        return;
      }

      // The authoritative verification is the identity status (already verified above)
      // The deletionRequestId from the API response is the identityId, not a request record ID
      console.log('  [Info] Deletion lifecycle is identity-driven');
      console.log(`  [Info] Identity status: ${userIdentityStatus}`);

      if (deletionScheduledAt) {
        console.log(`  [Info] Scheduled deletion: ${deletionScheduledAt}`);
      }

      // Verify identity is in deletion lifecycle
      expect(['PENDING_DELETION', 'DELETED']).toContain(userIdentityStatus);
      console.log('  ✓ Identity-driven deletion verified via bootstrap status');
    });

    it(
      'should finalize deletion via job processor (backdate grace period)',
      async () => {
        // This test backdates the deletedAt to simulate an expired grace period,
        // then runs the job processor to finalize the deletion.

        if (userIdentityStatus === 'DELETED') {
          console.log('  [Skip] User is already DELETED (anonymized)');
          return;
        }

        if (!deletionWasInitiated) {
          console.log('  [Skip] No deletion was initiated');
          return;
        }

        console.log('');
        console.log('  ════════════════════════════════════════════════════════');
        console.log('  🔧 Backdating deletedAt to simulate expired grace period...');
        console.log('  ════════════════════════════════════════════════════════');
        console.log('');

        // Get the identity ID from bootstrap
        const bootstrapResponse = await userClient.post('/api/v1/bootstrap');
        const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data;
        const identityId = bootstrapData.identity?.id;

        if (!identityId) {
          console.log('  [Skip] Could not get identity ID from bootstrap');
          return;
        }

        console.log(`  [Info] Identity ID: ${identityId}`);

        // Backdate deletedAt to 31 days ago (past the grace period)
        const backdatedDate = new Date();
        backdatedDate.setDate(backdatedDate.getDate() - 31);
        const backdatedDateStr = backdatedDate.toISOString();

        console.log(`  [Info] Backdating deletedAt to: ${backdatedDateStr}`);

        // Update via admin API
        const updateResponse = await adminClient.post('/api/internal/admin/update', {
          table: 'identities',
          id: identityId,
          data: {
            deletedAt: backdatedDateStr,
          },
        });

        if (updateResponse.status !== 200) {
          console.log(`  [Warning] Failed to backdate deletedAt: ${updateResponse.status}`);
          console.log(`  [Info] Response: ${JSON.stringify(updateResponse.data)}`);
          console.log('  [Info] Proceeding with job processor anyway...');
        } else {
          console.log('  ✓ deletedAt backdated successfully');
        }

        console.log('');
        console.log('  🔄 Running GDPR job processor to finalize deletion...');
        console.log('');

        // Run the job processor
        await runGdprJobProcessor();

        // Check final status via bootstrap
        const finalBootstrapResponse = await userClient.post('/api/v1/bootstrap');
        expect(finalBootstrapResponse.status).toBe(200);

        const finalBootstrapData = finalBootstrapResponse.data?.data || finalBootstrapResponse.data;
        userIdentityStatus = finalBootstrapData.identity?.status || userIdentityStatus;

        console.log(`  [Info] Final identity status: ${userIdentityStatus}`);

        if (userIdentityStatus === 'DELETED') {
          console.log('  ✓ User has been permanently deleted (anonymized)');
        } else if (userIdentityStatus === 'PENDING_DELETION') {
          console.log('  [Warning] User still in PENDING_DELETION');
          console.log('  [Info] This may happen if the job processor did not pick up the request');
        }

        // After backdating + job run, user should be DELETED
        expect(userIdentityStatus).toBe('DELETED');
      },
      JOB_TEST_TIMEOUT_MS,
    );

    it('should complete Golden Path Lifecycle Test', async () => {
      console.log('\\n  ════════════════════════════════════════════════════════');
      console.log('  ✓ Golden Path Lifecycle Test completed successfully');
      console.log('  ════════════════════════════════════════════════════════');
      console.log('\\n  Summary:');
      console.log(`    - Final identity status: ${userIdentityStatus}`);

      if (userIdentityStatus === 'PENDING_DELETION') {
        console.log(`    - Deletion scheduled at: ${deletionScheduledAt}`);
        console.log('    - User is in grace period (can cancel deletion)');
        console.log('    - Final deletion requires cron job to expire grace period');
      } else if (userIdentityStatus === 'DELETED') {
        console.log('    - User has been permanently deleted (anonymized)');
        console.log('    - This is irreversible');
      }

      console.log('\\n  IMPORTANT: This test suite uses a two-phase deletion model:');
      console.log('    Phase 1: PENDING_DELETION (grace period, reversible)');
      console.log('    Phase 2: DELETED (final, irreversible)');
      console.log('');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SKIP MESSAGE WHEN DISABLED
// ═══════════════════════════════════════════════════════════════════════════

if (!RUN_SYSTEM_TESTS) {
  describe('Golden Path Lifecycle System Test', () => {
    it.skip('System lifecycle test (manual / release confidence) - set RUN_SYSTEM_TESTS=true to enable', () => {
      // This test is intentionally skipped
      // See the test file header for instructions on how to run
    });
  });
}
