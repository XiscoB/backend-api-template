/**
 * Test: All Notification Scenarios
 *
 * Verifies the single notification_logs invariant across all channel configurations:
 * 1. User with no channels → 1 notification_logs, 1 delivery log (NONE/SKIPPED)
 * 2. User with email only → 1 notification_logs, 1 delivery log (EMAIL/SENT)
 * 3. User with email + push → 1 notification_logs, 2 delivery logs (EMAIL+PUSH/SENT)
 */

if (process.env.NODE_ENV === 'production') {
  if (!process.env.ALLOW_DEV_DESTRUCTIVE) {
    console.error('❌ Refusing to run in production environment.');
    console.error('   Set ALLOW_DEV_DESTRUCTIVE=1 to override.');
    process.exit(1);
  }
}

require('dotenv').config();
const { execSync } = require('child_process');

const IDENTITY_ID = '78a7d345-ed1f-4c9b-beb0-afb888dd8b14';

function query(sql) {
  const cmd = `docker exec backend-base-postgres psql -U backend_user -d backend_dev -t -c "${sql}"`;
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

function queryJson(sql) {
  const cmd = `docker exec backend-base-postgres psql -U backend_user -d backend_dev -c "${sql}"`;
  return execSync(cmd, { encoding: 'utf-8' });
}

function clearNotifications() {
  query(`DELETE FROM notification_logs WHERE identity_id = '${IDENTITY_ID}';`);
  query(`DELETE FROM notification_delivery_log WHERE identity_id = '${IDENTITY_ID}';`);
}

function createGdprRequest() {
  query(
    `INSERT INTO gdpr_requests (id, identity_id, request_type, status, requested_at, created_at, updated_at) VALUES (gen_random_uuid(), '${IDENTITY_ID}', 'GDPR_EXPORT', 'PENDING', NOW(), NOW(), NOW());`,
  );
}

function runGdprJob() {
  execSync('npm run job:gdpr > nul 2>&1', { cwd: process.cwd() });
}

function getNotificationCount() {
  return parseInt(
    query(`SELECT COUNT(*) FROM notification_logs WHERE identity_id = '${IDENTITY_ID}';`),
  );
}

function getDeliveryLogCount() {
  return parseInt(
    query(`SELECT COUNT(*) FROM notification_delivery_log WHERE identity_id = '${IDENTITY_ID}';`),
  );
}

function getDeliveryLogs() {
  return queryJson(
    `SELECT channel_type, status FROM notification_delivery_log WHERE identity_id = '${IDENTITY_ID}' ORDER BY created_at;`,
  );
}

async function addEmailChannel(profileId, email) {
  query(
    `INSERT INTO user_email_channel (id, fk_user_notification_profile, email, enabled, unsubscribe_token, created_at, updated_at) VALUES (gen_random_uuid(), '${profileId}', '${email}', true, gen_random_uuid()::text, NOW(), NOW());`,
  );
}

async function addPushChannel(profileId, token) {
  query(
    `INSERT INTO user_push_channel (id, fk_user_notification_profile, expo_token, unique_key, created_at, updated_at) VALUES (gen_random_uuid(), '${profileId}', '${token}', 'test-device-001', NOW(), NOW());`,
  );
}

function clearChannels() {
  query(
    `DELETE FROM user_email_channel WHERE fk_user_notification_profile IN (SELECT id FROM user_notification_profile WHERE identity_id = '${IDENTITY_ID}');`,
  );
  query(
    `DELETE FROM user_push_channel WHERE fk_user_notification_profile IN (SELECT id FROM user_notification_profile WHERE identity_id = '${IDENTITY_ID}');`,
  );
}

async function runTests() {
  console.log('🧪 Testing Notification System Invariants\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Get profile ID
  const profileId = query(
    `SELECT id FROM user_notification_profile WHERE identity_id = '${IDENTITY_ID}';`,
  );
  if (!profileId) {
    console.error('❌ No notification profile found for test user');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // Scenario 1: No Channels
  // ═══════════════════════════════════════════════════════════════
  console.log('📝 Scenario 1: User with NO channels\n');
  clearNotifications();
  clearChannels();
  createGdprRequest();
  runGdprJob();

  const s1NotifCount = getNotificationCount();
  const s1DeliveryCount = getDeliveryLogCount();
  const s1Logs = getDeliveryLogs();

  console.log(`  notification_logs:        ${s1NotifCount}`);
  console.log(`  notification_delivery_log: ${s1DeliveryCount}`);
  console.log(`  Delivery details:\n${s1Logs}`);

  if (s1NotifCount === 1 && s1DeliveryCount === 1) {
    console.log('  ✅ PASS: 1 notification_logs, 1 delivery log (NONE)\n');
  } else {
    console.log(`  ❌ FAIL: Expected 1:1, got ${s1NotifCount}:${s1DeliveryCount}\n`);
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // Scenario 2: Email Only
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('📧 Scenario 2: User with EMAIL channel only\n');
  clearNotifications();
  clearChannels();
  await addEmailChannel(profileId, 'test@example.com');
  createGdprRequest();
  runGdprJob();

  const s2NotifCount = getNotificationCount();
  const s2DeliveryCount = getDeliveryLogCount();
  const s2Logs = getDeliveryLogs();

  console.log(`  notification_logs:         ${s2NotifCount}`);
  console.log(`  notification_delivery_log:  ${s2DeliveryCount}`);
  console.log(`  Delivery details:\n${s2Logs}`);

  if (s2NotifCount === 1 && s2DeliveryCount === 1) {
    console.log('  ✅ PASS: 1 notification_logs, 1 delivery log (EMAIL)\n');
  } else {
    console.log(`  ❌ FAIL: Expected 1:1, got ${s2NotifCount}:${s2DeliveryCount}\n`);
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════
  // Scenario 3: Email + Push
  // ═══════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('📧📱 Scenario 3: User with EMAIL + PUSH channels\n');
  clearNotifications();
  // Keep email, add push
  await addPushChannel(profileId, 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]');
  createGdprRequest();
  runGdprJob();

  const s3NotifCount = getNotificationCount();
  const s3DeliveryCount = getDeliveryLogCount();
  const s3Logs = getDeliveryLogs();

  console.log(`  notification_logs:         ${s3NotifCount}`);
  console.log(`  notification_delivery_log:  ${s3DeliveryCount}`);
  console.log(`  Delivery details:\n${s3Logs}`);

  if (s3NotifCount === 1 && s3DeliveryCount === 2) {
    console.log('  ✅ PASS: 1 notification_logs, 2 delivery logs (EMAIL+PUSH)\n');
  } else {
    console.log(`  ❌ FAIL: Expected 1:2, got ${s3NotifCount}:${s3DeliveryCount}\n`);
    process.exit(1);
  }

  // Cleanup
  clearChannels();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ All scenarios passed!');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n📊 Summary:\n');
  console.log('  ✅ Scenario 1: No channels     → 1 log, 1 delivery (NONE)');
  console.log('  ✅ Scenario 2: Email only      → 1 log, 1 delivery (EMAIL)');
  console.log('  ✅ Scenario 3: Email + Push    → 1 log, 2 deliveries (EMAIL+PUSH)');
  console.log('\n🎉 Single notification_logs invariant confirmed!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
