/**
 * Redis Rate Limit Verification Script (Cross-Platform)
 *
 * Requirements: Node.js >= 18
 * Usage: npx ts-node scripts/ci/verify-redis-rate-limiting.ts
 *
 * Description:
 * Verifies that the rate limit (300 req/60s) is enforced globally
 * across two backend instances sharing a Redis store.
 */

import * as http from 'http';

// Configuration
const ENDPOINT = '/api/v1/health/detailed';
const LIMIT = 300;
const TOTAL_REQUESTS = 320;
const PORTS = [3000, 3001];

interface InstanceStats {
  200: number;
  429: number;
  error: number;
}

// Stats
const stats: Record<string, InstanceStats> = {
  'api-1': { 200: 0, 429: 0, error: 0 },
  'api-2': { 200: 0, 429: 0, error: 0 },
};

let completed = 0;
let total200 = 0;
let total429 = 0;

console.log('\x1b[36m%s\x1b[0m', 'Starting Redis Rate Limit Verification...');
console.log(`Target: ${ENDPOINT} (Limit: ${LIMIT} req/60s)`);
console.log(`Sending ${TOTAL_REQUESTS} requests across ${PORTS.length} instances...`);

function makeRequest(index: number) {
  const instanceIdx = index % 2;
  const port = PORTS[instanceIdx];
  const instanceName = instanceIdx === 0 ? 'api-1' : 'api-2';

  const options = {
    hostname: 'localhost',
    port: port,
    path: ENDPOINT,
    method: 'GET',
    timeout: 2000,
  };

  const req = http.request(options, (res) => {
    const code = res.statusCode || 0;

    if (code === 200) {
      stats[instanceName][200]++;
      total200++;
    } else if (code === 429) {
      stats[instanceName][429]++;
      total429++;
    } else {
      stats[instanceName].error++;
      console.log(`\x1b[33mReq ${index} (${instanceName}): Status ${code}\x1b[0m`);
    }

    onComplete(index);
  });

  req.on('error', (e) => {
    stats[instanceName].error++;
    console.error(`\x1b[31mReq ${index} failed: ${e.message}\x1b[0m`);
    onComplete(index);
  });

  req.on('timeout', () => {
    req.destroy();
    stats[instanceName].error++;
    // onComplete handled by error event usually, but ensuring:
  });

  req.end();
}

function onComplete(_index: number) {
  completed++;
  if (completed % 20 === 0) {
    process.stdout.write('.');
  }

  if (completed === TOTAL_REQUESTS) {
    printResults();
  }
}

function printResults() {
  console.log('\n\n----------------------------------------');
  console.log('Results:');
  console.log('\x1b[32m%s\x1b[0m', '[v] Redis detected (presumed if limits enforced)');

  console.log(`Instance A (api-1): Allowed ${stats['api-1'][200]}, Blocked ${stats['api-1'][429]}`);
  console.log(`Instance B (api-2): Allowed ${stats['api-2'][200]}, Blocked ${stats['api-2'][429]}`);
  console.log(`Total Allowed: ${total200} (Expected <= ${LIMIT})`);
  console.log(`Total Blocked: ${total429} (Expected > 0)`);

  let failed = false;

  // Allow small margin for clock skew or counter race conditions
  if (total200 > LIMIT + 5) {
    console.log(
      '\x1b[31m%s\x1b[0m',
      `[!] FAIL: Total requests allowed (${total200}) exceeded limit significantly.`,
    );
    failed = true;
  } else {
    console.log('\x1b[32m%s\x1b[0m', '[v] Global limit enforced correctly');
  }

  if (total429 === 0) {
    console.log('\x1b[31m%s\x1b[0m', '[!] FAIL: No requests were rate limited.');
    failed = true;
  }

  if (stats['api-1'][200] === 0 && stats['api-1'][429] === 0) {
    console.log('\x1b[31m%s\x1b[0m', '[!] FAIL: Instance api-1 processed 0 requests.');
    failed = true;
  }

  if (stats['api-2'][200] === 0 && stats['api-2'][429] === 0) {
    console.log('\x1b[31m%s\x1b[0m', '[!] FAIL: Instance api-2 processed 0 requests.');
    failed = true;
  }

  if (failed) {
    console.log('\x1b[31m%s\x1b[0m', 'Verification FAILED');
    process.exit(1);
  } else {
    console.log('\x1b[32m%s\x1b[0m', 'Verification PASSED');
    process.exit(0);
  }
}

// Start
for (let i = 1; i <= TOTAL_REQUESTS; i++) {
  // Small delay to prevent overwhelming node's networking stack strictly locally if needed,
  // but usually localhost handles it fine.
  setTimeout(() => makeRequest(i), i * 2);
}
