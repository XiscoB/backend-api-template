import * as http from 'http';

function makeRequest(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ statusCode: number | undefined; headers: http.IncomingHttpHeaders }>(
    (resolve, reject) => {
      const req = http.request(
        {
          hostname: 'localhost',
          port: 3000,
          path: path,
          method: 'GET',
          headers: headers,
        },
        (res) => {
          // Consume body to free up socket
          res.resume();
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
          });
        },
      );

      req.on('error', reject);
      req.end();
    },
  );
}

function checkHeaders(
  scenario: string,
  response: { headers: http.IncomingHttpHeaders },
  expectedHeaders: string[] = [],
) {
  const presentHeaders = Object.keys(response.headers).filter(
    (h) => h.toLowerCase().startsWith('x-ratelimit') || h.toLowerCase() === 'retry-after',
  );

  if (expectedHeaders.length === 0) {
    if (presentHeaders.length === 0) {
      console.log(`✅ [${scenario}] No rate-limit headers present (Expected)`);
      return true;
    } else {
      console.error(`❌ [${scenario}] Unexpected headers found: ${presentHeaders.join(', ')}`);
      return false;
    }
  } else {
    const missing = expectedHeaders.filter((h) => !response.headers[h.toLowerCase()]);
    if (missing.length === 0) {
      console.log(`✅ [${scenario}] All expected headers present: ${expectedHeaders.join(', ')}`);
      // Log values for inspection
      expectedHeaders.forEach((h) => {
        console.log(`   ${h}: ${String(response.headers[h.toLowerCase()] ?? '')}`);
      });
      return true;
    } else {
      console.error(`❌ [${scenario}] Missing expected headers: ${missing.join(', ')}`);
      return false;
    }
  }
}

async function verify() {
  const scenario = process.argv[2] || 'unknown';
  console.log(`🧪 Verifying Headers for Scenario: ${scenario}\n`);

  try {
    // 1. Undecorated Endpoint: /api/v1/health
    console.log('--- Undecorated Endpoint (/api/v1/health) ---');
    const uRes = await makeRequest('/api/v1/health');
    checkHeaders(`${scenario} - Undecorated`, uRes, []);

    // 2. Decorated Endpoint: /api/v1/health/detailed
    console.log('\n--- Decorated Endpoint (/api/v1/health/detailed) ---');
    const dRes = await makeRequest('/api/v1/health/detailed');

    let expected: string[] = [];
    if (scenario === 'redis-healthy') {
      expected = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'];
    }

    // For memory, redis-unhealthy, or unknown - expect NO headers
    checkHeaders(`${scenario} - Decorated`, dRes, expected);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Request failed:', message);
    process.exit(1);
  }
}

void verify();
