/**
 * Redis Fail-Fast Validation Script
 *
 * Verifies that the application fails to start under misconfigured Redis conditions.
 */

import { spawn } from 'child_process';
import * as path from 'path';

const ROOT_DIR = path.resolve(__dirname, '..', '..'); // Scripts are in scripts/ci
const TEST_TIMEOUT = 30000; // 30s timeout

// We use docker-compose run to get the environment context
const BASE_CMD = 'docker-compose';
const BASE_ARGS = ['run', '--rm', '--no-deps', '-e', 'RATE_LIMIT_DRIVER=redis'];

// Note: We use 'node dist/main' inside the container
// This assumes the container usage is still valid.
// However, the test script itself runs on host.

interface Scenario {
  name: string;
  env: Record<string, string>;
  expectedExitCode: number;
  expectedOutput: string[];
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Missing REDIS_URL',
    env: { REDIS_URL: '' }, // Override to empty
    expectedExitCode: 1,
    expectedOutput: ['REDIS_URL is required', 'Set REDIS_URL=redis://redis:6379'],
  },
  {
    name: 'Invalid REDIS_URL',
    env: { REDIS_URL: 'not-a-redis-url' },
    expectedExitCode: 1,
    expectedOutput: ['REDIS_URL must be a valid redis:// connection string'],
  },
  {
    name: 'Unreachable Redis',
    env: { REDIS_URL: 'redis://non-existent-host:6379' },
    expectedExitCode: 1,
    expectedOutput: ['Failed to connect to Redis', 'getaddrinfo'], // getaddrinfo ENOTFOUND or similar
  },
];

async function runScenario(scenario: Scenario) {
  console.log(`\n\x1b[36mRunning Scenario: ${scenario.name}...\x1b[0m`);

  const envArgs: string[] = [];
  for (const [key, val] of Object.entries(scenario.env)) {
    envArgs.push('-e');
    envArgs.push(`${key}=${val}`);
  }

  // We run 'node dist/main' directly to skip npm scripts overhead
  const args = [...BASE_ARGS, ...envArgs, 'backend', 'node', 'dist/main'];

  console.log(`Command: ${BASE_CMD} ${args.join(' ')}`);

  return new Promise<boolean>((resolve) => {
    const child = spawn(BASE_CMD, args, { cwd: ROOT_DIR, shell: true });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Timeout to kill process if it hangs (meaning it didn't fail fast)
    const timer = setTimeout(() => {
      console.log('\x1b[31m[!] Timeout - App did not fail fast!\x1b[0m');
      child.kill();
      killed = true;
      resolve(false);
    }, TEST_TIMEOUT);

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return;

      console.log(`Exit Code: ${code}`);

      // Check exit code
      if (code !== scenario.expectedExitCode) {
        console.log(
          `\x1b[31m[!] FAIL: Expected exit code ${scenario.expectedExitCode}, got ${code}\x1b[0m`,
        );
        resolve(false);
        return;
      }

      // Check output messages
      const fullOutput = stdout + stderr;
      const missingMessages = scenario.expectedOutput.filter(
        (msg: string) => !fullOutput.includes(msg),
      );

      if (missingMessages.length > 0) {
        console.log('\x1b[31m[!] FAIL: Missing expected error messages:\x1b[0m');
        missingMessages.forEach((m: string) => console.log(`    - "${m}"`));
        console.log('--- Output ---');
        console.log(fullOutput);
        console.log('--------------');
        resolve(false);
        return;
      }

      console.log('\x1b[32m[v] PASS\x1b[0m');
      resolve(true);
    });
  });
}

async function main() {
  console.log('Starting Redis Fail-Fast Validation...');
  console.log('Note: This script uses docker-compose run, ensuring container environment.');

  let success = true;
  for (const scenario of SCENARIOS) {
    const passed = await runScenario(scenario);
    if (!passed) success = false;
  }

  if (!success) {
    console.log('\n\x1b[31mValidation Failed\x1b[0m');
    process.exit(1);
  } else {
    console.log('\n\x1b[32mValidation Passed - All scenarios failed fast as expected.\x1b[0m');
    process.exit(0);
  }
}

void main();
