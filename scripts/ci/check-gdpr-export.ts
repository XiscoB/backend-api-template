#!/usr/bin/env node

/**
 * Check GDPR Export Status
 *
 * Shows the latest GDPR export request and its storage location.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as path from 'path';
import * as fs from 'fs';

// Check DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  process.exit(1);
}

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
});

// Create adapter and Prisma client
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  try {
    // Get the latest export request
    // Note: Model is "Request" in schema with @@map("gdpr_requests") for table name
    const exportRequest = await prisma.request.findFirst({
      where: { requestType: 'GDPR_EXPORT' },
      orderBy: { createdAt: 'desc' },
    });

    if (!exportRequest) {
      console.log('No GDPR export requests found.');
      return;
    }

    console.log('Latest GDPR Export Request:');
    console.log('═══════════════════════════════════════════════\n');
    console.log(`Request ID:     ${exportRequest.id}`);
    console.log(`Identity ID:    ${exportRequest.identityId}`);
    console.log(`Status:         ${exportRequest.status}`);
    console.log(`Created:        ${exportRequest.createdAt.toISOString()}`);
    console.log(`Updated:        ${exportRequest.updatedAt.toISOString()}`);

    // These fields may exist at the DB level but aren't yet in the Prisma schema
    const completedAt: unknown = Reflect.get(exportRequest, 'completedAt');
    const storageKey: unknown = Reflect.get(exportRequest, 'storageKey');
    const checksum: unknown = Reflect.get(exportRequest, 'checksum');
    const sizeBytes: unknown = Reflect.get(exportRequest, 'fileSizeBytes');

    console.log(
      `Completed:      ${completedAt instanceof Date ? completedAt.toISOString() : 'N/A'}`,
    );
    console.log(`Storage Key:    ${typeof storageKey === 'string' ? storageKey : 'N/A'}`);
    console.log(`Checksum:       ${typeof checksum === 'string' ? checksum : 'N/A'}`);
    console.log(`Size (bytes):   ${typeof sizeBytes === 'number' ? String(sizeBytes) : 'N/A'}`);

    // Check if file exists locally
    if (typeof storageKey === 'string' && exportRequest.status === 'COMPLETED') {
      const storageDir = process.env.GDPR_STORAGE_DIR || './storage/gdpr-exports';
      const identityDir = path.join(storageDir, exportRequest.identityId);
      const zipPath = path.join(identityDir, `${storageKey}.zip`);
      const absolutePath = path.resolve(zipPath);

      console.log('\n');
      console.log('File Location:');
      console.log('═══════════════════════════════════════════════\n');
      console.log(`Expected Path:  ${absolutePath}`);

      if (fs.existsSync(absolutePath)) {
        const stats = fs.statSync(absolutePath);
        console.log(`Status:         ✅ File exists`);
        console.log(`Size:           ${stats.size} bytes`);
        console.log(`Modified:       ${stats.mtime.toISOString()}`);
        console.log('\nTo download/view the file:');
        console.log(`  File Explorer: ${absolutePath}`);
        console.log(`  PowerShell:    Invoke-Item "${absolutePath}"`);
      } else {
        console.log(`Status:         ❌ File not found`);
        console.log('\nThe export may have been processed but the file is missing.');
        console.log('This could happen if:');
        console.log('  - The storage directory was cleared');
        console.log('  - The file was manually deleted');
        console.log('  - The storage configuration changed');
      }
    }

    // Always exit 0 - this is a diagnostic script, not a validation
    process.exit(0);
  } catch (error) {
    console.error('Error checking GDPR export:', error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main();
