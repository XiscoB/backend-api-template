/**
 * Safety Checker
 *
 * Validates that scenario tests can run safely.
 * Prevents accidental execution against production systems.
 */

// Production indicators in URLs
const PRODUCTION_INDICATORS = [
  'prod',
  'production',
  'live',
  'prd',
  '.com', // Be cautious with real domains
  '.io',
  '.app',
];

// Safe URL patterns (development/test)
const SAFE_PATTERNS = [
  'localhost',
  '127.0.0.1',
  'host.docker.internal',
  '_dev',
  '_test',
  '-dev',
  '-test',
  'staging',
];

class SafetyChecker {
  constructor() {
    this.checks = [];
  }

  /**
   * Run all safety checks.
   * @returns {{ passed: boolean, checks: Array<{ name: string, passed: boolean, message: string }> }}
   */
  runAllChecks() {
    this.checks = [];

    this.checkScenarioTestingEnabled();
    this.checkNotProduction();
    this.checkDatabaseUrl();
    this.checkApiUrl();

    const allPassed = this.checks.every((c) => c.passed);

    return {
      passed: allPassed,
      checks: this.checks,
    };
  }

  /**
   * Check that SCENARIO_TESTING=true is set.
   */
  checkScenarioTestingEnabled() {
    const enabled = process.env.SCENARIO_TESTING === 'true';

    this.checks.push({
      name: 'SCENARIO_TESTING enabled',
      passed: enabled,
      message: enabled ? 'SCENARIO_TESTING=true' : 'SCENARIO_TESTING must be set to "true"',
    });

    if (enabled) {
      console.log('  ✓ SCENARIO_TESTING=true enabled');
    } else {
      console.log('  ✗ SCENARIO_TESTING=true required');
    }
  }

  /**
   * Check that NODE_ENV is not production.
   */
  checkNotProduction() {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const isProduction = nodeEnv.toLowerCase() === 'production';

    this.checks.push({
      name: 'Not production environment',
      passed: !isProduction,
      message: isProduction ? 'NODE_ENV=production detected' : `NODE_ENV=${nodeEnv}`,
    });

    if (!isProduction) {
      console.log(`  ✓ Not running in production (NODE_ENV=${nodeEnv})`);
    } else {
      console.log('  ✗ Cannot run in NODE_ENV=production');
    }
  }

  /**
   * Check that DATABASE_URL looks safe.
   */
  checkDatabaseUrl() {
    const dbUrl = process.env.DATABASE_URL || '';
    const isSafe = this.isUrlSafe(dbUrl);

    this.checks.push({
      name: 'Database URL safe',
      passed: isSafe,
      message: isSafe
        ? 'Database URL appears safe for testing'
        : 'Database URL may point to production',
    });

    if (isSafe) {
      console.log('  ✓ Database URL safe');
    } else {
      console.log('  ✗ Database URL appears to point to production');
    }
  }

  /**
   * Check that API_BASE_URL looks safe.
   */
  checkApiUrl() {
    const apiUrl = process.env.API_BASE_URL || 'http://localhost:3000/api';
    const isSafe = this.isUrlSafe(apiUrl);

    this.checks.push({
      name: 'API URL safe',
      passed: isSafe,
      message: isSafe ? 'API URL appears safe for testing' : 'API URL may point to production',
    });

    if (isSafe) {
      console.log('  ✓ API URL safe');
    } else {
      console.log('  ✗ API URL appears to point to production');
    }
  }

  /**
   * Check if a URL appears safe for testing.
   * @param {string} url - URL to check
   * @returns {boolean} True if URL appears safe
   */
  isUrlSafe(url) {
    if (!url) return true; // No URL is safe (will use defaults)

    const lowerUrl = url.toLowerCase();

    // Check for safe patterns first
    for (const pattern of SAFE_PATTERNS) {
      if (lowerUrl.includes(pattern)) {
        return true;
      }
    }

    // Check for production indicators
    for (const indicator of PRODUCTION_INDICATORS) {
      if (lowerUrl.includes(indicator)) {
        return false;
      }
    }

    // Default to safe if no indicators found
    return true;
  }
}

module.exports = { SafetyChecker };
