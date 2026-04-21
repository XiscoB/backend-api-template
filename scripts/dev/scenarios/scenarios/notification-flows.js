/**
 * Notification Scenarios
 *
 * Scenarios 2-4:
 * - Manage notification channels (email, push)
 * - List and read notifications
 * - Mark all as read
 *
 * @see TEST_UI_CONTRACT.md Sections 4.3, 4.4 and Scenarios 2-4
 */

const {
  assertStatus,
  assertEnvelope,
  assertHasProperty,
  assertType,
  assertUUID,
  assertEqual,
} = require('../lib/assertions');

/**
 * Scenario 2: Manage Notification Channels
 *
 * Per TEST_UI_CONTRACT.md Section 9 - Scenario 2
 */
const notificationChannelsScenario = {
  name: 'Scenario 2: Manage Notification Channels',
  description: 'Verify email and push channel management lifecycle',

  async run(ctx, steps) {
    // Setup: Create a user with profile
    const externalUserId = ctx.generateExternalUserId();
    const userToken = ctx.createUserToken({ sub: externalUserId });

    await ctx.post(
      '/v1/profiles/me',
      { displayName: 'Channel Test User', language: 'en' },
      { token: userToken },
    );

    // Step 1: GET notification-profile (auto-creates if needed)
    const profileResponse = await ctx.get('/v1/notification-profile', { token: userToken });

    assertStatus(profileResponse, 200, 'Should get or create notification profile');
    assertEnvelope(profileResponse);

    const notifProfile = profileResponse.data.data;
    assertHasProperty(notifProfile, 'profile');
    assertHasProperty(notifProfile, 'emailChannels');
    assertHasProperty(notifProfile, 'pushChannels');
    assertType(notifProfile.emailChannels, 'array');
    assertType(notifProfile.pushChannels, 'array');
    steps.log('GET /notification-profile → profile auto-created');

    // Step 2: Add email channel
    const emailPayload = {
      email: `test-${externalUserId.slice(-6)}@example.com`,
      enabled: true,
      promoEnabled: false,
    };

    const emailResponse = await ctx.post('/v1/notification-profile/email', emailPayload, {
      token: userToken,
    });

    assertStatus(emailResponse, 200, 'Should create email channel');
    assertEnvelope(emailResponse);

    const emailChannel = emailResponse.data.data;
    assertUUID(emailChannel.id);
    assertEqual(emailChannel.email, emailPayload.email);
    assertEqual(emailChannel.enabled, true);
    assertEqual(emailChannel.promoEnabled, false);
    steps.log('POST /notification-profile/email → channel created');

    // Step 3: Add push channel
    const pushPayload = {
      expoToken: 'ExponentPushToken[scenario-test-token-123]',
      uniqueKey: `device-${externalUserId.slice(-6)}`,
      platform: 'ios',
    };

    const pushResponse = await ctx.post('/v1/notification-profile/push', pushPayload, {
      token: userToken,
    });

    assertStatus(pushResponse, 200, 'Should create push channel');
    assertEnvelope(pushResponse);

    const pushChannel = pushResponse.data.data;
    assertUUID(pushChannel.id);
    assertEqual(pushChannel.uniqueKey, pushPayload.uniqueKey);
    assertEqual(pushChannel.platform, 'ios');
    assertEqual(pushChannel.isActive, true);
    // Note: expoToken is NOT returned for security per contract
    steps.log('POST /notification-profile/push → channel created');

    // Step 4: Verify both channels in profile
    const profileResponse2 = await ctx.get('/v1/notification-profile', { token: userToken });

    assertStatus(profileResponse2, 200);
    const updatedProfile = profileResponse2.data.data;
    assertEqual(updatedProfile.emailChannels.length, 1, 'Should have 1 email channel');
    assertEqual(updatedProfile.pushChannels.length, 1, 'Should have 1 push channel');
    steps.log('GET /notification-profile → both channels listed');

    // Step 5: Disable email channel
    const disableResponse = await ctx.put(
      `/v1/notification-profile/email/${emailChannel.id}/enabled`,
      { enabled: false },
      { token: userToken },
    );

    assertStatus(disableResponse, 200, 'Should disable email channel');
    assertEqual(disableResponse.data.data.enabled, false);
    steps.log('PUT /email/:id/enabled → channel disabled');

    // Step 6: Delete push channel
    const deletePushResponse = await ctx.delete(`/v1/notification-profile/push/${pushChannel.id}`, {
      token: userToken,
    });

    assertStatus(deletePushResponse, 204, 'Should delete push channel');
    steps.logFinal('DELETE /push/:id → 204 No Content');
  },
};

/**
 * Scenario 3: List and Read Notifications
 *
 * Per TEST_UI_CONTRACT.md Section 9 - Scenario 3
 */
const notificationListReadScenario = {
  name: 'Scenario 3: List and Read Notifications',
  description: 'Verify notification list, unread check, and mark as read',

  async run(ctx, steps) {
    // Setup: Create a user with profile
    const externalUserId = ctx.generateExternalUserId();
    const userToken = ctx.createUserToken({ sub: externalUserId });

    await ctx.post(
      '/v1/profiles/me',
      { displayName: 'Notification Test User', language: 'en' },
      { token: userToken },
    );

    // Step 1: GET notifications
    const listResponse = await ctx.get('/v1/notifications', { token: userToken });

    assertStatus(listResponse, 200, 'Should list notifications');
    assertEnvelope(listResponse);
    assertType(listResponse.data.data, 'array');
    steps.log('GET /notifications → 200 (array)');

    // Step 2: Check unread exists
    const unreadResponse = await ctx.get('/v1/notifications/unread-exists', { token: userToken });

    assertStatus(unreadResponse, 200);
    assertEnvelope(unreadResponse);
    assertHasProperty(unreadResponse.data.data, 'hasUnread');
    assertType(unreadResponse.data.data.hasUnread, 'boolean');
    steps.log('GET /notifications/unread-exists → hasUnread (boolean)');

    // Step 3: If there are notifications, try marking one as read
    const notifications = listResponse.data.data;
    if (notifications.length > 0) {
      const notifId = notifications[0].id;
      const readResponse = await ctx.post(
        `/v1/notifications/${notifId}/read`,
        {},
        { token: userToken },
      );

      assertStatus(readResponse, 200, 'Should mark notification as read');
      assertEnvelope(readResponse);
      assertHasProperty(readResponse.data.data, 'readAt');
      steps.log(`POST /notifications/${notifId}/read → readAt set`);
    } else {
      steps.info('No notifications to mark as read (new user)');
    }

    steps.logFinal('Notification read flow verified');
  },
};

/**
 * Scenario 4: Mark All Notifications as Read
 *
 * Per TEST_UI_CONTRACT.md Section 9 - Scenario 4
 */
const markAllReadScenario = {
  name: 'Scenario 4: Mark All Notifications as Read',
  description: 'Verify read-all endpoint marks all notifications and returns count',

  async run(ctx, steps) {
    // Setup: Create a user with profile
    const externalUserId = ctx.generateExternalUserId();
    const userToken = ctx.createUserToken({ sub: externalUserId });

    await ctx.post(
      '/v1/profiles/me',
      { displayName: 'Read All Test User', language: 'en' },
      { token: userToken },
    );

    // Step 1: Mark all as read
    const readAllResponse = await ctx.post('/v1/notifications/read-all', {}, { token: userToken });

    assertStatus(readAllResponse, 200, 'Should mark all as read');
    assertEnvelope(readAllResponse);
    assertHasProperty(readAllResponse.data.data, 'count');
    assertType(readAllResponse.data.data.count, 'number');
    steps.log(`POST /notifications/read-all → count=${readAllResponse.data.data.count}`);

    // Step 2: Check unread exists should be false
    const unreadResponse = await ctx.get('/v1/notifications/unread-exists', { token: userToken });

    assertStatus(unreadResponse, 200);
    assertEqual(unreadResponse.data.data.hasUnread, false, 'Should have no unread notifications');
    steps.logFinal('GET /notifications/unread-exists → hasUnread=false');
  },
};

module.exports = {
  notificationChannelsScenario,
  notificationListReadScenario,
  markAllReadScenario,
};
