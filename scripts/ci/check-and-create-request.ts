#!/usr/bin/env node

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);

  // Get recent requests
  const requests = await prisma.request.findMany({
    where: { requestType: 'GDPR_EXPORT' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log('\n=== Recent GDPR Export Requests ===\n');
  requests.forEach((req, idx) => {
    console.log(`${idx + 1}. Request ID: ${req.id}`);
    console.log(`   Identity ID: ${req.identityId}`);
    console.log(`   Status: ${req.status}`);
    console.log(`   Created: ${req.createdAt.toISOString()}`);
    console.log(`   Updated: ${req.updatedAt.toISOString()}`);
    if (req.storageKey) {
      console.log(`   Storage Key: ${req.storageKey}`);
    }
    console.log('');
  });

  // Check for files
  const storageDir = './storage/gdpr-exports';

  console.log('=== Checking Storage ===\n');
  console.log(`Storage Directory: ${path.resolve(storageDir)}\n`);

  if (fs.existsSync(storageDir)) {
    const contents = fs.readdirSync(storageDir);
    if (contents.length > 0) {
      console.log('Found directories:');
      contents.forEach((dir) => {
        const dirPath = path.join(storageDir, dir);
        if (fs.statSync(dirPath).isDirectory()) {
          const files = fs.readdirSync(dirPath);
          console.log(`\n  ${dir}/`);
          files.forEach((file) => {
            const filePath = path.join(dirPath, file);
            const stats = fs.statSync(filePath);
            console.log(`    - ${file} (${stats.size} bytes)`);
          });
        }
      });
    } else {
      console.log('Storage directory is empty\n');
    }
  } else {
    console.log('Storage directory does not exist\n');
  }

  // Create a new request if there are no PENDING ones
  const pendingCount = await prisma.request.count({
    where: {
      requestType: 'GDPR_EXPORT',
      status: 'PENDING',
    },
  });

  if (pendingCount === 0) {
    console.log('=== Creating New Test Request ===\n');

    const identity = await prisma.identity.findFirst();
    if (identity) {
      const newRequest = await prisma.request.create({
        data: {
          identityId: identity.id,
          requestType: 'GDPR_EXPORT',
          status: 'PENDING',
        },
      });
      console.log(`✅ Created new request: ${newRequest.id}`);
      console.log(`   Run "npm run job:gdpr" to process it\n`);
    } else {
      console.log('❌ No identities found in database\n');
    }
  } else {
    console.log(`Found ${pendingCount} pending request(s). Run "npm run job:gdpr" to process.\n`);
  }

  await app.close();
}

main().catch(console.error);
