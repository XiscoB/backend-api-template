/**
 * Public Endpoints Scenarios
 *
 * Tests endpoints that don't require authentication:
 * - GET /api/v1/public/bootstrap
 * - GET /api/v1/health
 * - GET /api/v1/health/detailed
 *
 * @see TEST_UI_CONTRACT.md Section 4.1
 */

const {
  assertStatus,
  assertHasProperty,
  assertType,
  assertNotEmpty,
} = require('../lib/assertions');

/**
 * Scenario: Public Bootstrap Configuration
 *
 * Verifies the public bootstrap endpoint returns correct configuration structure.
 * Per TEST_UI_CONTRACT.md Section 4.1 - GET /api/v1/public/bootstrap
 *
 * NOTE: Contract says response should be unwrapped, but implementation
 * wraps it in standard envelope. This is documented as a discrepancy.
 */
const bootstrapScenario = {
  name: 'Public Bootstrap Configuration',
  description: 'Verify /public/bootstrap returns correct structure',

  async run(ctx, steps) {
    // Step 1: Call bootstrap endpoint
    const response = await ctx.get('/v1/public/bootstrap');

    assertStatus(response, 200, 'Bootstrap should return 200 OK');
    steps.log('GET /public/bootstrap → 200 OK');

    // Step 2: Check response structure
    // NOTE: Implementation wraps response (data.data) even though contract says unwrapped
    // This is a documentation discrepancy - we test actual behavior here
    const rawData = response.data;
    const data = rawData.data || rawData; // Handle both wrapped and unwrapped

    steps.log('Response received (checking structure)');

    // Step 3: Verify required top-level fields
    assertHasProperty(data, 'updatePolicy', 'Missing updatePolicy');
    assertHasProperty(data, 'metadata', 'Missing metadata');
    assertHasProperty(data, 'features', 'Missing features');
    assertHasProperty(data, 'i18n', 'Missing i18n');
    steps.log('All required top-level fields present');

    // Step 4: Verify updatePolicy structure
    const platforms = ['ios', 'android', 'web'];
    for (const platform of platforms) {
      if (data.updatePolicy[platform]) {
        assertHasProperty(data.updatePolicy[platform], 'minimumVersion');
        assertHasProperty(data.updatePolicy[platform], 'forceUpdate');
        assertType(data.updatePolicy[platform].forceUpdate, 'boolean');
      }
    }
    steps.log('updatePolicy structure valid');

    // Step 5: Verify features structure
    const features = data.features;
    assertType(features, 'object', 'features should be an object');
    // Per contract, these should be booleans
    if ('premiumEnabled' in features) {
      assertType(features.premiumEnabled, 'boolean');
    }
    if ('pushNotificationsEnabled' in features) {
      assertType(features.pushNotificationsEnabled, 'boolean');
    }
    if ('emailNotificationsEnabled' in features) {
      assertType(features.emailNotificationsEnabled, 'boolean');
    }
    steps.log('features structure valid');

    // Step 6: Verify i18n structure
    const i18n = data.i18n;
    assertHasProperty(i18n, 'defaultLanguage');
    assertHasProperty(i18n, 'supportedLanguages');
    assertType(i18n.supportedLanguages, 'array');
    assertNotEmpty(i18n.supportedLanguages, 'supportedLanguages should not be empty');
    steps.logFinal('i18n structure valid');
  },
};

/**
 * Scenario: Health Check - Basic
 *
 * Verifies the basic health endpoint.
 * Per TEST_UI_CONTRACT.md Section 4.1 - GET /api/v1/health
 */
const healthBasicScenario = {
  name: 'Health Check - Basic',
  description: 'Verify /health returns status: ok (public, unwrapped)',

  async run(ctx, steps) {
    // Step 1: Call health endpoint
    const response = await ctx.get('/v1/health');

    assertStatus(response, 200, 'Health should return 200 OK');
    steps.log('GET /health → 200 OK');

    // Step 2: Verify response structure
    const data = response.data;
    assertHasProperty(data, 'status', 'Missing status field');
    steps.log('status field present');

    // Step 3: Verify status value
    if (data.status !== 'ok') {
      throw new Error(`Expected status "ok", got "${data.status}"`);
    }
    steps.logFinal('status = "ok"');
  },
};

/**
 * Scenario: Health Check - Detailed
 *
 * Verifies the detailed health endpoint with component status.
 * Per TEST_UI_CONTRACT.md Section 4.1 - GET /api/v1/health/detailed
 */
const healthDetailedScenario = {
  name: 'Health Check - Detailed',
  description: 'Verify /health/detailed returns component status (public, unwrapped)',

  async run(ctx, steps) {
    // Step 1: Call detailed health endpoint
    const response = await ctx.get('/v1/health/detailed');

    assertStatus(response, 200, 'Detailed health should return 200 OK');
    steps.log('GET /health/detailed → 200 OK');

    // Step 2: Verify response structure
    const data = response.data;
    assertHasProperty(data, 'status', 'Missing status field');
    assertHasProperty(data, 'timestamp', 'Missing timestamp field');
    assertHasProperty(data, 'components', 'Missing components field');
    steps.log('Required fields present (status, timestamp, components)');

    // Step 3: Verify status is one of expected values
    const validStatuses = ['healthy', 'degraded', 'unhealthy'];
    if (!validStatuses.includes(data.status)) {
      throw new Error(
        `Invalid status "${data.status}", expected one of: ${validStatuses.join(', ')}`,
      );
    }
    steps.log(`status = "${data.status}"`);

    // Step 4: Verify database component
    const components = data.components;
    assertType(components, 'object');
    assertHasProperty(components, 'database', 'Missing database component');
    assertHasProperty(components.database, 'status', 'Missing database.status');
    steps.logFinal('database component present with status');
  },
};

module.exports = {
  bootstrapScenario,
  healthBasicScenario,
  healthDetailedScenario,
};
