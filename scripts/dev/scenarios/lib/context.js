/**
 * Test Context
 *
 * Manages shared state and utilities for scenario tests.
 * Provides JWT generation, HTTP client, and cleanup tracking.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const http = require('http');
const https = require('https');
const { URL } = require('url');

// Import shared test keys (same keys used by backend in scenario mode)
const { TEST_PRIVATE_KEY, TEST_PUBLIC_KEY, TEST_ISSUER, TEST_AUDIENCE } = require('./test-keys');

/**
 * Wrong key pair for invalid signature tests.
 * This one is generated at runtime since it's meant to NOT match.
 */
const wrongKeyPair = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

class TestContext {
  constructor() {
    this.apiUrl = process.env.API_BASE_URL || 'http://localhost:3000/api';
    this.testId = `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.createdResources = [];
    this.initialized = false;

    // JWT keys - use shared static keys for valid tokens
    this.privateKey = TEST_PRIVATE_KEY;
    this.publicKey = TEST_PUBLIC_KEY;
    this.wrongPrivateKey = wrongKeyPair.privateKey;
  }

  /**
   * Initialize the test context.
   * Validates connectivity and prepares for test execution.
   */
  async initialize() {
    // Check API is reachable
    try {
      const response = await this.request('GET', '/v1/health');
      if (response.status !== 200) {
        throw new Error(`Health check returned ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Cannot reach API at ${this.apiUrl}: ${error.message}`);
    }

    this.initialized = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // JWT Generation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a unique external user ID for test data.
   * @returns {string} External user ID
   */
  generateExternalUserId() {
    return `scenario-test-${this.testId}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Create a valid user JWT.
   *
   * @param {Object} options - Token options
   * @param {string} options.sub - Subject (user ID)
   * @param {string} [options.email] - Email claim
   * @param {string[]} [options.roles=['USER']] - User roles
   * @param {number} [options.expiresIn=3600] - Expiration in seconds
   * @returns {string} Signed JWT
   */
  createUserToken(options = {}) {
    const sub = options.sub || this.generateExternalUserId();
    const roles = options.roles || ['USER'];

    const payload = {
      sub,
      ...(options.email && { email: options.email }),
      app_metadata: { roles },
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      expiresIn: options.expiresIn || 3600,
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
    });
  }

  /**
   * Create an admin JWT with specified privilege level.
   *
   * @param {Object} options - Token options
   * @param {string} options.sub - Subject (user ID)
   * @param {'read'|'write'} [options.level='read'] - Admin privilege level
   * @param {string} [options.email] - Email claim
   * @returns {string} Signed JWT
   */
  createAdminToken(options = {}) {
    const sub = options.sub || this.generateExternalUserId();
    const level = options.level || 'read';

    const payload = {
      sub,
      ...(options.email && { email: options.email }),
      internal_admin: true,
      internal_admin_level: level,
      app_metadata: { roles: ['USER'] },
    };

    return jwt.sign(payload, this.privateKey, {
      algorithm: 'RS256',
      expiresIn: 3600,
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
    });
  }

  /**
   * Create an expired JWT.
   *
   * @param {Object} options - Token options
   * @returns {string} Expired JWT
   */
  createExpiredToken(options = {}) {
    const sub = options.sub || this.generateExternalUserId();

    const payload = {
      sub,
      app_metadata: { roles: ['USER'] },
      iss: TEST_ISSUER,
      aud: TEST_AUDIENCE,
      iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
      exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
    };

    return jwt.sign(payload, this.privateKey, { algorithm: 'RS256' });
  }

  /**
   * Create a JWT with invalid signature.
   *
   * @param {Object} options - Token options
   * @returns {string} JWT signed with wrong key
   */
  createInvalidSignatureToken(options = {}) {
    const sub = options.sub || this.generateExternalUserId();

    const payload = {
      sub,
      app_metadata: { roles: ['USER'] },
    };

    return jwt.sign(payload, this.wrongPrivateKey, {
      algorithm: 'RS256',
      expiresIn: 3600,
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
    });
  }

  /**
   * Create a malformed JWT string.
   * @returns {string} Invalid JWT string
   */
  createMalformedToken() {
    return 'not.a.valid.jwt.token';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HTTP Client
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Make an HTTP request to the API.
   *
   * @param {string} method - HTTP method
   * @param {string} path - API path (relative to apiUrl)
   * @param {Object} [options] - Request options
   * @param {Object} [options.body] - Request body
   * @param {string} [options.token] - JWT token
   * @param {Object} [options.headers] - Additional headers
   * @returns {Promise<{ status: number, data: any, headers: Object }>}
   */
  request(method, path, options = {}) {
    return new Promise((resolve, reject) => {
      // Build the full URL - handle path joining properly
      // If path starts with /, remove it to avoid replacing the base path
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      const baseUrl = this.apiUrl.endsWith('/') ? this.apiUrl : this.apiUrl + '/';
      const url = new URL(cleanPath, baseUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      };

      if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
      }

      const requestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
      };

      const req = client.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({
              status: res.statusCode,
              data: parsed,
              headers: res.headers,
            });
          } catch (e) {
            resolve({
              status: res.statusCode,
              data: { raw: data },
              headers: res.headers,
            });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      // Timeout after 30 seconds
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }

  /**
   * Convenience method for GET requests.
   */
  get(path, options = {}) {
    return this.request('GET', path, options);
  }

  /**
   * Convenience method for POST requests.
   */
  post(path, body, options = {}) {
    return this.request('POST', path, { ...options, body });
  }

  /**
   * Convenience method for PATCH requests.
   */
  patch(path, body, options = {}) {
    return this.request('PATCH', path, { ...options, body });
  }

  /**
   * Convenience method for PUT requests.
   */
  put(path, body, options = {}) {
    return this.request('PUT', path, { ...options, body });
  }

  /**
   * Convenience method for DELETE requests.
   */
  delete(path, options = {}) {
    return this.request('DELETE', path, options);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Resource Tracking
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Track a created resource for cleanup.
   *
   * @param {string} type - Resource type (e.g., 'profile', 'notification')
   * @param {string} id - Resource ID
   * @param {Object} [metadata] - Additional metadata
   */
  trackResource(type, id, metadata = {}) {
    this.createdResources.push({ type, id, metadata, createdAt: new Date() });
  }

  /**
   * Cleanup all tracked resources.
   * Best effort - failures are logged but don't stop cleanup.
   */
  async cleanup() {
    // Cleanup is best-effort and depends on the test data
    // In a real implementation, this would:
    // 1. Delete test profiles
    // 2. Delete test notifications
    // 3. Delete test GDPR requests
    //
    // For now, we rely on namespaced data (scenario_*) being
    // identifiable and cleanable via admin tools or cron jobs

    console.log(`  ℹ ${this.createdResources.length} resources tracked during tests`);

    // Note: Actual cleanup would require admin endpoints or direct DB access
    // which is intentionally not included to keep tests isolated from infra
  }
}

module.exports = { TestContext };
