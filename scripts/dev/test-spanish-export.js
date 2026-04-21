#!/usr/bin/env node
require('dotenv').config();

async function main() {
  const { PrismaClient } =
    await import('../../dist/common/prisma/generated/prisma/client/index.js');
  const prisma = new PrismaClient();

  try {
    // Update profile to Spanish
    await prisma.profile.updateMany({ data: { language: 'es' } });
    console.log('✅ Updated all profiles to Spanish (es)');

    // Create a new export request
    const request = await prisma.request.create({
      data: {
        identityId: '78a7d345-ed1f-4c9b-beb0-afb888dd8b14',
        requestType: 'GDPR_EXPORT',
        status: 'PENDING',
      },
    });
    console.log(`✅ Created new export request: ${request.id}`);
    console.log('\nNow run: npm run job:gdpr');

    await prisma.$disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
