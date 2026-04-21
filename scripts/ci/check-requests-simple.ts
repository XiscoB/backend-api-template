#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const prisma = new PrismaClient();

  try {
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
        console.log('Storage directory is empty');
      }
    } else {
      console.log('Storage directory does not exist');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
