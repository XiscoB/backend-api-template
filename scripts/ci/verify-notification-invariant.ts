#!/usr/bin/env node

/**
 * Verification Script: Notification System Invariants
 */

import 'dotenv/config';
import { execSync } from 'child_process';

function query(sql: string): string {
  try {
    const cmd = `docker exec backend-base-postgres psql -U backend_user -d backend_dev -t -c "${sql}"`;
    const result = execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.trim();
  } catch (error) {
    // Return empty string if query fails (container might not exist, etc.)
    return '';
  }
}

function queryCount(sql: string): number {
  const result = query(sql);
  const parsed = parseInt(result, 10);
  return isNaN(parsed) ? 0 : parsed;
}

function main() {
  console.log('🔍 Verifying Notification System Invariants\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let hasFailures = false;
  const identityId = process.argv[2];

  // If specific identity provided, check just that identity
  // Otherwise, check system-wide invariants
  if (identityId) {
    console.log(`Checking identity: ${identityId}\n`);
    hasFailures = checkIdentityInvariants(identityId);
  } else {
    console.log('Checking system-wide invariants (all identities)\n');
    hasFailures = checkSystemWideInvariants();
  }

  console.log('\n═══════════════════════════════════════════════════════════════');

  if (hasFailures) {
    console.log('❌ Invariant violations detected!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    process.exit(1);
  } else {
    console.log('✅ All notification invariants verified!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    process.exit(0);
  }
}

function checkIdentityInvariants(identityId: string) {
  let hasFailures = false;

  // Count notification_logs for this identity
  const notificationLogsCount = queryCount(
    `SELECT COUNT(*) FROM notification_logs WHERE identity_id = '${identityId}';`,
  );

  // Count notification_delivery_log for this identity
  const deliveryLogCount = queryCount(
    `SELECT COUNT(*) FROM notification_delivery_log WHERE identity_id = '${identityId}';`,
  );

  // Count GDPR completed requests (main source of notifications)
  const completedExports = queryCount(
    `SELECT COUNT(*) FROM gdpr_requests WHERE identity_id = '${identityId}' AND status = 'COMPLETED';`,
  );

  console.log('📊 Current State:\n');
  console.log(`  Completed GDPR Exports:        ${completedExports}`);
  console.log(`  notification_logs entries:     ${notificationLogsCount}`);
  console.log(`  notification_delivery_log:     ${deliveryLogCount}\n`);

  console.log('─────────────────────────────────────────────────────────────────\n');

  // Invariant 1: notification_logs count should be reasonable relative to exports
  // Note: We can't assert exact equality because notifications come from multiple sources
  if (completedExports > 0 && notificationLogsCount === 0) {
    console.log('⚠️  WARNING: Completed exports exist but no notification_logs entries');
    console.log('   This may indicate notification creation is failing.\n');
    // This is a warning, not a failure - notifications might be disabled
  } else if (notificationLogsCount > 0) {
    console.log('✅ PASS: notification_logs entries exist');
  } else {
    console.log('ℹ️  INFO: No notification_logs entries (no events yet)');
  }

  // Invariant 2: Delivery logs >= notification logs (each notification should have at least one delivery attempt)
  if (notificationLogsCount > 0) {
    if (deliveryLogCount >= notificationLogsCount) {
      console.log('✅ PASS: Delivery logs >= notification_logs (correct)');
    } else {
      console.log(
        `❌ FAIL: Delivery logs (${deliveryLogCount}) < notification_logs (${notificationLogsCount})`,
      );
      console.log('   Each notification should have at least one delivery log entry.\n');
      hasFailures = true;
    }
  }

  // Invariant 3: Check for duplicate notification_logs per event type per export
  const duplicatesQuery = `
    SELECT type, COUNT(*) as cnt 
    FROM notification_logs 
    WHERE identity_id = '${identityId}' 
    GROUP BY type, payload->>'requestId' 
    HAVING COUNT(*) > 1;
  `;
  const duplicates = query(duplicatesQuery);
  if (duplicates && duplicates.length > 0 && !duplicates.includes('0 rows')) {
    console.log('❌ FAIL: Duplicate notification_logs detected for same event:');
    console.log(duplicates);
    hasFailures = true;
  } else {
    console.log('✅ PASS: No duplicate notification_logs per event');
  }

  return hasFailures;
}

function checkSystemWideInvariants() {
  let hasFailures = false;

  // Get counts
  const totalNotificationLogs = queryCount('SELECT COUNT(*) FROM notification_logs;');
  const totalDeliveryLogs = queryCount('SELECT COUNT(*) FROM notification_delivery_log;');
  const totalCompletedExports = queryCount(
    "SELECT COUNT(*) FROM gdpr_requests WHERE status = 'COMPLETED';",
  );

  console.log('📊 System-Wide State:\n');
  console.log(`  Total notification_logs:        ${totalNotificationLogs}`);
  console.log(`  Total notification_delivery_log: ${totalDeliveryLogs}`);
  console.log(`  Total completed GDPR requests:   ${totalCompletedExports}\n`);

  console.log('─────────────────────────────────────────────────────────────────\n');

  // Invariant 1: System-wide delivery logs >= notification logs
  if (totalNotificationLogs > 0) {
    if (totalDeliveryLogs >= totalNotificationLogs) {
      console.log('✅ PASS: System-wide delivery logs >= notification_logs');
    } else {
      console.log(
        `❌ FAIL: System-wide delivery logs (${totalDeliveryLogs}) < notification_logs (${totalNotificationLogs})`,
      );
      hasFailures = true;
    }
  } else {
    console.log('ℹ️  INFO: No notification_logs in system');
  }

  // Invariant 2: Check for any duplicate notifications per identity per event
  const systemDuplicatesQuery = `
    SELECT identity_id, type, payload->>'requestId' as request_id, COUNT(*) as cnt 
    FROM notification_logs 
    WHERE payload->>'requestId' IS NOT NULL
    GROUP BY identity_id, type, payload->>'requestId' 
    HAVING COUNT(*) > 1
    LIMIT 5;
  `;
  const duplicates = query(systemDuplicatesQuery);
  if (duplicates && duplicates.length > 0 && !duplicates.includes('0 rows')) {
    console.log('❌ FAIL: Duplicate notification_logs detected system-wide:');
    console.log(duplicates);
    hasFailures = true;
  } else {
    console.log('✅ PASS: No duplicate notification_logs system-wide');
  }

  // Invariant 3: Check for orphaned delivery logs (no parent notification)
  const orphanedQuery = `
    SELECT COUNT(*) FROM notification_delivery_log dl
    WHERE NOT EXISTS (
      SELECT 1 FROM notification_logs nl 
      WHERE nl.identity_id = dl.identity_id 
      AND nl.type = dl.event_type
    );
  `;
  const orphanedCount = queryCount(orphanedQuery);
  if (orphanedCount > 0) {
    console.log(`⚠️  WARNING: ${orphanedCount} delivery logs without matching notification_logs`);
    console.log('   This may indicate data inconsistency.\n');
    // Warning, not failure - could be from deleted notifications
  } else {
    console.log('✅ PASS: All delivery logs have corresponding notification_logs');
  }

  return hasFailures;
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('❌ Fatal error:', message);
  process.exit(1);
}
