/**
 * Seed Broken GDPR Data
 *
 * Usage:
 *   npx ts-node scripts/ops/jobs/seed-broken-gdpr.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../src/app.module';
import { RequestStatus, RequestType } from '@prisma/client';
import { PrismaService } from '../../../src/common/prisma/prisma.service';

void (async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);

  console.log('--- Seeding Broken GDPR Data ---');

  // Create a dummy identity
  const identity = await prisma.identity.create({
    data: {
      externalUserId: `test-broken-${Date.now()}`,
    },
  });
  console.log(`Created Identity: ${identity.id}`);

  // 1. FAILED request
  await prisma.request.create({
    data: {
      identityId: identity.id,
      requestType: RequestType.GDPR_EXPORT,
      status: RequestStatus.FAILED,
      errorMessage: 'Simulated failure for testing',
    },
  });
  console.log('Seeded FAILED request');

  // 2. STUCK request (PROCESSING > 1 hour)
  await prisma.request.create({
    data: {
      identityId: identity.id,
      requestType: RequestType.GDPR_DELETE,
      status: RequestStatus.PROCESSING,
      updatedAt: new Date(Date.now() - 90 * 60 * 1000), // 90 mins ago
    },
  });
  console.log('Seeded STUCK request');

  console.log('Done.');
  await app.close();
})();
