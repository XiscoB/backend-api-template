#!/usr/bin/env node

/**
 * Example: External Cron Cleanup Script
 *
 * This script demonstrates how to trigger infrastructure cleanup
 * from an external cron job (Kubernetes CronJob, AWS EventBridge, etc.)
 *
 * Prerequisites:
 * - Backend API is running
 * - Admin console is enabled (ADMIN_CONSOLE_ENABLED=true)
 * - Valid JWT with ADMIN_WRITE privilege
 *
 * Usage:
 *   npx ts-node scripts/ops/cleanup-cron.ts
 *
 * Environment variables:
 *   API_URL - Backend API URL (default: http://localhost:3000)
 *   ADMIN_JWT - JWT token with ADMIN_WRITE privilege
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ADMIN_JWT = process.env.ADMIN_JWT;

if (!ADMIN_JWT) {
  console.error('Error: ADMIN_JWT environment variable is required');
  console.error('');
  console.error('Usage:');
  console.error('  ADMIN_JWT=your-jwt-token npx ts-node scripts/ops/cleanup-cron.ts');
  process.exit(1);
}

interface CleanupJobResult {
  name: string;
  recordsDeleted: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface CleanupResponse {
  data: {
    totalRecordsDeleted: number;
    durationMs: number;
    jobs: CleanupJobResult[];
  };
}

async function runCleanup() {
  const url = `${API_URL}/api/internal/admin/cleanup/run-all`;

  console.log(`Triggering cleanup at: ${url}`);
  console.log('');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ADMIN_JWT}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = (await response.json()) as CleanupResponse;

    console.log('✅ Cleanup completed successfully');
    console.log('');
    console.log(`Total records deleted: ${result.data.totalRecordsDeleted}`);
    console.log(`Duration: ${result.data.durationMs}ms`);
    console.log('');
    console.log('Job results:');

    for (const job of result.data.jobs) {
      const status = job.error ? '❌' : '✅';
      console.log(`  ${status} ${job.name}: ${job.recordsDeleted} record(s) deleted`);

      if (job.error) {
        console.log(`     Error: ${job.error}`);
      }

      if (job.metadata) {
        console.log(`     Metadata: ${JSON.stringify(job.metadata)}`);
      }
    }

    process.exit(0);
  } catch (error: unknown) {
    console.error('❌ Cleanup failed');
    console.error('');
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

void runCleanup();
