#!/usr/bin/env node

/**
 * Master Validation Script
 *
 * Runs all validation and check scripts to verify system health.
 * Use this to quickly validate the entire system after changes or deployments.
 *
 * Usage: npx ts-node scripts/ci/validate-all.ts
 */

import 'dotenv/config';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

interface Check {
  name: string;
  command: string;
  critical: boolean;
  category: string;
  description: string;
}

interface CheckResult {
  name: string;
  success: boolean;
  critical: boolean;
  duration: number;
  output: string;
  error: string;
  category: string;
}

/**
 * Validation checks organized by category.
 */
const CHECKS: Check[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // INFRASTRUCTURE CHECKS (Critical - must pass for system to function)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Database Connection',
    // Note: dev scripts are skipped in this batch, using original js for now if it exists,
    // BUT we should consistently use ts-node for reliability if we can.
    // However, I haven't converted scripts/dev/* yet.
    // Wait, test-db-connection.js is in scripts/dev, which I was told NOT to touch?
    // "Convert require() to import in scripts/ci and scripts/ops".
    // "scripts/dev" is out of scope for Batch 1.
    command: 'node scripts/dev/test-db-connection.js',
    critical: true,
    category: 'infrastructure',
    description: 'Verifies PostgreSQL connectivity and credentials',
  },
  {
    name: 'Database Schema Validation',
    command: 'npx ts-node scripts/ci/validate-db.ts',
    critical: true,
    category: 'infrastructure',
    description: 'Validates Prisma schema, models, migrations, and indexes',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTRACT CHECKS (Critical - API contracts must be honored)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Bootstrap DTO Contract',
    command: 'npx ts-node scripts/ci/validate-bootstrap-contract.ts',
    critical: true,
    category: 'contract',
    description: 'Validates /api/v1/public/bootstrap response structure',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GDPR COMPLIANCE CHECKS (Non-critical warnings - require attention)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'GDPR Export Coverage',
    command: 'npx ts-node scripts/ci/validate-gdpr-coverage.ts',
    critical: false,
    category: 'gdpr',
    description: 'Checks all user data tables are registered for GDPR export',
  },
  {
    name: 'GDPR Dynamic Collector',
    // scripts/dev is out of scope.
    command: 'node scripts/dev/test-dynamic-collector.js',
    critical: false,
    category: 'gdpr',
    description: 'Tests registry-driven data collection for exports',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NOTIFICATION SYSTEM CHECKS (Non-critical - system health indicators)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Notification Invariants',
    command: 'npx ts-node scripts/ci/verify-notification-invariant.ts',
    critical: false,
    category: 'notification',
    description: 'Verifies notification system invariants (1 log per event, delivery logs)',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DIAGNOSTIC CHECKS (Non-critical - informational only)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    name: 'Notification System Status',
    command: 'npx ts-node scripts/ci/check-notifications.ts',
    critical: false,
    category: 'diagnostic',
    description: 'Shows notification table statistics and recent activity',
  },
  {
    name: 'GDPR Export Status',
    command: 'npx ts-node scripts/ci/check-gdpr-export.ts',
    critical: false,
    category: 'diagnostic',
    description: 'Shows latest GDPR export request and file status',
  },
];

async function runCheck(check: Check): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(check.command, {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const duration = Date.now() - startTime;

    return {
      name: check.name,
      success: true,
      critical: check.critical,
      duration,
      output: stdout,
      error: stderr,
      category: check.category,
    };
  } catch (error: unknown) {
    const duration = Date.now() - startTime;

    // exec errors include stdout/stderr as properties
    const execErr = error as { stdout?: string; stderr?: string; message?: string };

    return {
      name: check.name,
      success: false,
      critical: check.critical,
      duration,
      output: execErr.stdout ?? '',
      error: execErr.stderr ?? execErr.message ?? String(error),
      category: check.category,
    };
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         BACKEND BASE API - SYSTEM VALIDATION REPORT           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(
    `Checks:  ${CHECKS.length} total (${CHECKS.filter((c) => c.critical).length} critical)\n`,
  );

  const results: CheckResult[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let criticalFailed = 0;

  // Group checks by category for organized output
  const categories = [...new Set(CHECKS.map((c) => c.category))];

  for (const category of categories) {
    const categoryChecks = CHECKS.filter((c) => c.category === category);
    console.log(`\n─── ${category.toUpperCase()} ───\n`);

    for (const check of categoryChecks) {
      process.stdout.write(`  ${check.name}...`);

      const result = await runCheck(check);
      results.push(result);

      if (result.success) {
        console.log(` ✅ PASSED (${result.duration}ms)`);
        totalPassed++;
      } else {
        const marker = check.critical ? '❌ CRITICAL' : '⚠️  WARNING';
        console.log(` ${marker} (${result.duration}ms)`);
        totalFailed++;
        if (check.critical) {
          criticalFailed++;
        }
      }
    }
  }

  // Print summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log(`Total Checks:     ${CHECKS.length}`);
  console.log(`✅ Passed:        ${totalPassed}`);
  console.log(`⚠️  Failed:        ${totalFailed}`);
  console.log(`❌ Critical:      ${criticalFailed}`);

  const overallStatus = criticalFailed === 0 ? '✅ HEALTHY' : '❌ UNHEALTHY';
  console.log(`\nOverall Status:   ${overallStatus}`);

  // Print failed checks details
  if (totalFailed > 0) {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                     FAILED CHECKS                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    for (const result of results.filter((r) => !r.success)) {
      const marker = result.critical ? '❌ CRITICAL' : '⚠️  WARNING';
      console.log(`${marker} ${result.name}`);
      console.log('─'.repeat(65));

      if (result.output) {
        console.log('Output:');
        console.log(result.output.slice(0, 500)); // First 500 chars
      }

      if (result.error) {
        console.log('\nError:');
        console.log(result.error.slice(0, 500)); // First 500 chars
      }

      console.log('\n');
    }
  }

  // Verbose output option
  if (process.argv.includes('--verbose') || process.argv.includes('-v')) {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                    DETAILED OUTPUT                             ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    for (const result of results) {
      const status = result.success ? '✅' : result.critical ? '❌' : '⚠️';
      console.log(`\n${status} ${result.name} (${result.duration}ms)`);
      console.log('═'.repeat(65));
      console.log(result.output);

      if (result.error) {
        console.log('\nErrors/Warnings:');
        console.log(result.error);
      }
      console.log('\n');
    }
  }

  console.log(`\nCompleted: ${new Date().toISOString()}`);
  console.log('\n💡 Tip: Run with --verbose or -v to see detailed output from all checks\n');

  // Exit with appropriate code
  process.exit(criticalFailed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('❌ Fatal error running validation:', error);
  process.exit(1);
});
