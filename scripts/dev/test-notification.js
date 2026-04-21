#!/usr/bin/env node

/**
 * Test notification service directly
 */

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../../dist/app.module');

async function testNotifications() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  try {
    const GlobalNotificationService = await app.resolve(
      require('../../dist/modules/notifications/global-notification.service')
        .GlobalNotificationService,
    );

    console.log('🔔 Testing notification service...\n');

    const testUserId = '78a7d345-ed1f-4c9b-beb0-afb888dd8b14';

    console.log(`Sending test notification to user: ${testUserId}`);

    const result = await GlobalNotificationService.notifyUser({
      userId: testUserId,
      eventType: 'GDPR_EXPORT_READY',
      payload: {
        title: 'Test notification',
        body: 'Testing notification system',
        requestId: 'test-123',
      },
    });

    console.log('\nNotification result:');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n✅ Test complete');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

testNotifications();
