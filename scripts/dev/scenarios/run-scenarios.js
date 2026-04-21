#!/usr/bin/env node

/**
 * Scenario Test Runner
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⚠️  DESTRUCTIVE TESTS - NEVER RUN IN PRODUCTION  ⚠️
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Runs end-to-end scenario tests derived from TEST_UI_CONTRACT.md.
 * Creates fake data, tests documented behavior, and verifies contract compliance.
 *
 * Usage:
 *   npm run test:scenarios
 *
 * Safety:
 *   - Automatically enables SCENARIO_TESTING mode (static test JWT keys)
 *   - Refuses to run if NODE_ENV=production
 *   - Refuses to run against production-looking URLs
 *   - Creates namespaced test data (scenario_*)
 *
 * @see docs/TEST_UI_CONTRACT.md - Authoritative source for expected behavior
 * @see scripts/scenarios/README.md - Documentation for this test suite
 */

// Enable scenario testing mode (uses static test JWT keys from test-keys.js)
process.env.SCENARIO_TESTING = 'true';

require('dotenv').config();

const { ScenarioRunner } = require('./lib/runner');
const { SafetyChecker } = require('./lib/safety');
const { TestContext } = require('./lib/context');
const { getAllScenarios } = require('./registry');

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SCENARIO TESTING - TEST_UI_CONTRACT.md Verification');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 1: Safety Checks
  // ─────────────────────────────────────────────────────────────────────────
  console.log('🔒 Safety Checks:');

  const safetyChecker = new SafetyChecker();
  const safetyResult = safetyChecker.runAllChecks();

  if (!safetyResult.passed) {
    console.log('');
    console.log('❌ SAFETY CHECK FAILED - Aborting');
    console.log('');
    console.log('To run scenario tests, you must:');
    console.log('  1. Set SCENARIO_TESTING=true');
    console.log('  2. Not be in production environment');
    console.log('  3. Use non-production database and API URLs');
    console.log('');
    console.log('Example:');
    console.log('  SCENARIO_TESTING=true npm run test:scenarios');
    console.log('');
    process.exit(1);
  }

  console.log('');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2: Initialize Test Context
  // ─────────────────────────────────────────────────────────────────────────
  console.log('🔧 Initializing Test Context...');

  const context = new TestContext();
  await context.initialize();

  console.log(`  ✓ API URL: ${context.apiUrl}`);
  console.log(`  ✓ Test ID: ${context.testId}`);
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3: Run Scenarios
  // ─────────────────────────────────────────────────────────────────────────
  const scenarios = getAllScenarios();
  const runner = new ScenarioRunner(context, scenarios);

  console.log(`📋 Running ${scenarios.length} scenarios...\n`);

  const results = await runner.runAll();

  // ─────────────────────────────────────────────────────────────────────────
  // Step 4: Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('🧹 Cleaning up test data...');

  try {
    await context.cleanup();
    console.log('  ✓ Cleanup completed');
  } catch (error) {
    console.log(`  ⚠ Cleanup failed: ${error.message}`);
    console.log('    (Manual cleanup may be required)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 5: Report Results
  // ─────────────────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  if (failed === 0) {
    console.log(`  ✅ RESULTS: ${passed}/${results.length} scenarios passed`);
  } else {
    console.log(`  ❌ RESULTS: ${passed}/${results.length} passed, ${failed} failed`);
    console.log('');
    console.log('  Failed scenarios:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`    • ${r.name}: ${r.error}`);
      });
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────────

process.on('unhandledRejection', (error) => {
  console.error('');
  console.error('❌ Unhandled Error:', error.message);
  console.error('');
  process.exit(1);
});

main().catch((error) => {
  console.error('');
  console.error('❌ Fatal Error:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  console.error('');
  process.exit(1);
});
