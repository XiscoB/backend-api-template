#!/usr/bin/env node

/**
 * Test GDPR Export with Real ZIP Generation
 *
 * This script:
 * 1. Creates a new GDPR export request
 * 2. Processes it via the job processor
 * 3. Checks if the ZIP file was created
 * 4. Shows where to find it
 */

require('dotenv').config();
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  GDPR Export Test with Real ZIP Generation');
  console.log('═══════════════════════════════════════════════\n');

  // Use a test identity ID (this should exist in your database)
  // You'll need to replace this with an actual identity ID from your database
  const testIdentityId = '78a7d345-ed1f-4c9b-beb0-afb888dd8b14';

  console.log(`Test Identity: ${testIdentityId}\n`);

  try {
    // Step 1: Create a GDPR export request directly in database
    console.log('Step 1: Creating GDPR export request...');
    // Create request using Prisma directly
    console.log('   Creating via npm script...\n');
    await execAsync('npm run job:gdpr');

    console.log('\n✅ GDPR export processed!\n');

    // Step 3: Check for ZIP file
    console.log('Step 2: Checking for generated ZIP file...');
    const storageDir = process.env.GDPR_STORAGE_DIR || './storage/gdpr-exports';
    const identityDir = path.join(storageDir, testIdentityId);

    try {
      const files = await fs.readdir(identityDir, { recursive: true });
      const zipFiles = files.filter((f) => f.endsWith('.zip'));

      if (zipFiles.length > 0) {
        console.log(`\n✅ Found ${zipFiles.length} ZIP file(s):\n`);
        for (const file of zipFiles) {
          const fullPath = path.join(identityDir, file);
          const stats = await fs.stat(fullPath);
          const absolutePath = path.resolve(fullPath);
          console.log(`   File: ${file}`);
          console.log(`   Size: ${stats.size} bytes`);
          console.log(`   Path: ${absolutePath}`);
          console.log(`   Modified: ${stats.mtime.toISOString()}\n`);
        }

        console.log('To open the file:');
        console.log(`   Invoke-Item "${path.resolve(identityDir)}"`);
      } else {
        console.log('\n❌ No ZIP files found in storage directory.');
      }
    } catch (error) {
      console.log(`\n❌ Storage directory not found: ${path.resolve(identityDir)}`);
      console.log('   The export may have failed or not been processed yet.');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
