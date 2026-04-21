#!/usr/bin/env node

if (process.env.NODE_ENV === 'production') {
  if (!process.env.ALLOW_DEV_DESTRUCTIVE) {
    console.error('❌ Refusing to run in production environment.');
    console.error('   Set ALLOW_DEV_DESTRUCTIVE=1 to override.');
    process.exit(1);
  }
}

/**
 * Reset an existing GDPR export request to PENDING for testing
 */

require('dotenv').config();

async function main() {
  // Import Prisma and adapter for Prisma 7.x
  const { PrismaClient } = await import('@prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const { Pool } = await import('pg');

  // Create PostgreSQL connection pool
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Create Prisma adapter
  const adapter = new PrismaPg(pool);

  // Initialize Prisma Client with adapter
  const prisma = new PrismaClient({ adapter });

  try {
    // Find the most recent completed export
    const lastExport = await prisma.request.findFirst({
      where: {
        requestType: 'GDPR_EXPORT',
        status: 'COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastExport) {
      console.log('No completed export found. Creating a new one...');

      // Get the first identity
      const identity = await prisma.identity.findFirst();
      if (!identity) {
        console.error('No identity found in database!');
        process.exit(1);
      }

      const newRequest = await prisma.request.create({
        data: {
          identityId: identity.id,
          requestType: 'GDPR_EXPORT',
          status: 'PENDING',
        },
      });

      console.log(`✅ Created new GDPR export request: ${newRequest.id}`);
      console.log(`   Identity: ${identity.id}`);
      console.log(`\nNow run: npm run job:gdpr`);
    } else {
      // Reset the existing one
      await prisma.request.update({
        where: { id: lastExport.id },
        data: {
          status: 'PENDING',
          processedAt: null,
          dataPayload: null,
          expiresAt: null,
        },
      });

      console.log(`✅ Reset export request to PENDING: ${lastExport.id}`);
      console.log(`   Identity: ${lastExport.identityId}`);
      console.log(`\nNow run: npm run job:gdpr`);
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
