#!/usr/bin/env node

/**
 * Check notification table contents
 */

import 'dotenv/config';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

async function checkNotifications() {
  try {
    console.log('🔍 Checking notification tables via Docker...\n');

    const dbUser = 'backend_user';
    const dbName = 'backend_dev';

    // Check scheduled_notifications
    const { stdout: scheduledOutput } = await execAsync(
      `docker exec backend-base-postgres psql -U ${dbUser} -d ${dbName} -t -c "SELECT COUNT(*) FROM scheduled_notifications;"`,
    );
    const scheduledCount = parseInt(scheduledOutput.trim());
    console.log(`📋 ScheduledNotification records: ${scheduledCount}`);

    if (scheduledCount > 0) {
      const { stdout: recentScheduled } = await execAsync(
        `docker exec backend-base-postgres psql -U ${dbUser} -d ${dbName} -c "SELECT id, identity_id, type, status, scheduled_at, created_at FROM scheduled_notifications ORDER BY created_at DESC LIMIT 5;"`,
      );
      console.log('\nRecent scheduled notifications:');
      console.log(recentScheduled);
    }

    // Check notification_delivery_log (singular!)
    const { stdout: deliveryOutput } = await execAsync(
      `docker exec backend-base-postgres psql -U ${dbUser} -d ${dbName} -t -c "SELECT COUNT(*) FROM notification_delivery_log;"`,
    );
    const deliveryCount = parseInt(deliveryOutput.trim());
    console.log(`\n📬 NotificationDeliveryLog records: ${deliveryCount}`);

    if (deliveryCount > 0) {
      const { stdout: recentDelivery } = await execAsync(
        `docker exec backend-base-postgres psql -U ${dbUser} -d ${dbName} -c "SELECT id, identity_id, event_type, channel_type, status, created_at FROM notification_delivery_log ORDER BY created_at DESC LIMIT 5;"`,
      );
      console.log('\nRecent delivery logs:');
      console.log(recentDelivery);
    }

    // Check GDPR requests
    const { stdout: gdprOutput } = await execAsync(
      `docker exec backend-base-postgres psql -U ${dbUser} -d ${dbName} -t -c "SELECT COUNT(*) FROM gdpr_requests WHERE request_type = 'GDPR_EXPORT';"`,
    );
    const gdprCount = parseInt(gdprOutput.trim());
    console.log(`\n📦 Total GDPR export requests: ${gdprCount}`);

    const { stdout: completedOutput } = await execAsync(
      `docker exec backend-base-postgres psql -U ${dbUser} -d ${dbName} -t -c "SELECT COUNT(*) FROM gdpr_requests WHERE request_type = 'GDPR_EXPORT' AND status = 'COMPLETED';"`,
    );
    const completedCount = parseInt(completedOutput.trim());
    console.log(`✅ COMPLETED GDPR exports: ${completedCount}`);

    if (completedCount > 0) {
      const { stdout: recentCompleted } = await execAsync(
        `docker exec backend-base-postgres psql -U ${dbUser} -d ${dbName} -c "SELECT id, identity_id, status, updated_at FROM gdpr_requests WHERE request_type = 'GDPR_EXPORT' AND status = 'COMPLETED' ORDER BY updated_at DESC LIMIT 5;"`,
      );
      console.log('\nRecent completed GDPR requests:');
      console.log(recentCompleted);
    }

    // Summary
    console.log('\n' + '═'.repeat(70));
    console.log('SUMMARY');
    console.log('═'.repeat(70));
    console.log(`Total GDPR exports: ${gdprCount}`);
    console.log(`Completed exports: ${completedCount}`);
    console.log(`Scheduled notifications: ${scheduledCount}`);
    console.log(`Delivery logs: ${deliveryCount}`);

    if (completedCount > 0 && scheduledCount === 0) {
      console.log('\n⚠️  CRITICAL ISSUE FOUND:');
      console.log('════════════════════════════════════════════════════════════════════');
      console.log(`${completedCount} completed exports exist but NO notifications found!`);
      console.log('This confirms the notification system is NOT working.');
      console.log('\nPossible causes:');
      console.log('1. notificationService.notifyUser() is not being called');
      console.log('2. The call is failing silently (caught and logged only)');
      console.log('3. No notification profile exists for test user');
      console.log('4. Database transaction is rolling back');
      console.log('════════════════════════════════════════════════════════════════════');
      // This is a diagnostic check, not a blocking validation
      // Exit 0 because this is informational, not an invariant violation
    } else if (completedCount > 0 && scheduledCount > 0) {
      console.log('\n✅ Notifications are being created for GDPR exports.');
    }

    // Always exit 0 - this is a diagnostic script
    process.exit(0);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Error:', message);
    process.exit(1);
  }
}

void checkNotifications();
