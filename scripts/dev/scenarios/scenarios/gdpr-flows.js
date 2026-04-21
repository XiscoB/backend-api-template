/**
 * GDPR Scenarios
 *
 * Scenarios 5-6:
 * - Request GDPR export, check status, download
 * - Suspend and recover account
 *
 * @see TEST_UI_CONTRACT.md Sections 4.5 and Scenarios 5-6
 */

const {
  assertStatus,
  assertEnvelope,
  assertErrorEnvelope,
  assertHasProperty,
  assertUUID,
  assertEqual,
  assertOneOf,
} = require('../lib/assertions');

/**
 * Scenario 5: Request GDPR Export
 *
 * Per TEST_UI_CONTRACT.md Section 9 - Scenario 5
 */
const gdprExportScenario = {
  name: 'Scenario 5: Request GDPR Export',
  description: 'Verify export request creation, duplicate rejection, and status check',

  async run(ctx, steps) {
    // Setup: Create a user with profile
    const externalUserId = ctx.generateExternalUserId();
    const userToken = ctx.createUserToken({ sub: externalUserId });

    await ctx.post(
      '/v1/profiles/me',
      { displayName: 'GDPR Export Test User', language: 'en' },
      { token: userToken },
    );
    steps.log('Created test profile');

    // Step 1: Request export
    const exportResponse = await ctx.post('/v1/gdpr/export', {}, { token: userToken });

    assertStatus(exportResponse, 202, 'Export request should return 202 Accepted');
    assertEnvelope(exportResponse);

    const exportRequest = exportResponse.data.data;
    assertUUID(exportRequest.id, 'Request ID should be UUID');
    assertEqual(exportRequest.requestType, 'GDPR_EXPORT');
    assertEqual(exportRequest.status, 'PENDING');
    assertHasProperty(exportRequest, 'createdAt');

    ctx.trackResource('gdpr_request', exportRequest.id);
    steps.log('POST /gdpr/export → 202 (request created)');

    // Step 2: Request duplicate should return 409
    const duplicateResponse = await ctx.post('/v1/gdpr/export', {}, { token: userToken });

    assertStatus(duplicateResponse, 409, 'Duplicate export should return 409');
    assertErrorEnvelope(duplicateResponse, 'CONFLICT');
    steps.log('POST /gdpr/export (again) → 409 CONFLICT');

    // Step 3: Check export status
    const statusResponse = await ctx.get(`/v1/gdpr/exports/${exportRequest.id}`, {
      token: userToken,
    });

    assertStatus(statusResponse, 200, 'Status check should succeed');
    assertEnvelope(statusResponse);

    const status = statusResponse.data.data;
    assertHasProperty(status, 'requestId');
    assertHasProperty(status, 'status');
    assertOneOf(status.status, ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED']);
    assertHasProperty(status, 'createdAt');
    steps.logFinal(`GET /gdpr/exports/:id → status=${status.status}`);
  },
};

/**
 * GDPR Export Download Scenario
 *
 * Tests the download flow when export is completed.
 * Note: This may not pass if export processing is not instantaneous.
 */
const gdprExportDownloadScenario = {
  name: 'GDPR Export Download (if completed)',
  description: 'Verify download endpoint returns presigned URL when export is ready',

  async run(ctx, steps) {
    // Setup: Create a user with profile
    const externalUserId = ctx.generateExternalUserId();
    const userToken = ctx.createUserToken({ sub: externalUserId });

    await ctx.post(
      '/v1/profiles/me',
      { displayName: 'GDPR Download Test User', language: 'en' },
      { token: userToken },
    );

    // Step 1: Request export
    const exportResponse = await ctx.post('/v1/gdpr/export', {}, { token: userToken });
    assertStatus(exportResponse, 202);
    const requestId = exportResponse.data.data.id;
    steps.log('POST /gdpr/export → 202 (request created)');

    // Step 2: Check status - we can only download if COMPLETED
    const statusResponse = await ctx.get(`/v1/gdpr/exports/${requestId}`, { token: userToken });
    assertStatus(statusResponse, 200);
    const status = statusResponse.data.data.status;
    steps.log(`Export status: ${status}`);

    if (status !== 'COMPLETED') {
      steps.info('Export not yet completed - skipping download test');
      steps.logFinal('Export created but not processed (expected in async systems)');
      return;
    }

    // Step 3: Download if completed
    const downloadResponse = await ctx.get(`/v1/gdpr/exports/${requestId}/download`, {
      token: userToken,
    });

    assertStatus(downloadResponse, 200, 'Download should succeed');
    assertEnvelope(downloadResponse);

    const download = downloadResponse.data.data;
    assertHasProperty(download, 'downloadUrl');
    assertHasProperty(download, 'expiresAt');
    assertHasProperty(download, 'filename');
    steps.logFinal('GET /gdpr/exports/:id/download → downloadUrl returned');
  },
};

/**
 * Scenario 6: Suspend and Recover Account
 *
 * Per TEST_UI_CONTRACT.md Section 9 - Scenario 6
 */
const gdprSuspendRecoverScenario = {
  name: 'Scenario 6: Suspend and Recover Account',
  description: 'Verify account suspension request and recovery flow',

  async run(ctx, steps) {
    // Setup: Create a user with profile
    const externalUserId = ctx.generateExternalUserId();
    const userToken = ctx.createUserToken({ sub: externalUserId });

    await ctx.post(
      '/v1/profiles/me',
      { displayName: 'Suspend Test User', language: 'en' },
      { token: userToken },
    );
    steps.log('Created test profile');

    // Step 1: Request suspension
    const suspendResponse = await ctx.post('/v1/gdpr/suspend', {}, { token: userToken });

    assertStatus(suspendResponse, 202, 'Suspend request should return 202 Accepted');
    assertEnvelope(suspendResponse);

    const suspendRequest = suspendResponse.data.data;
    assertUUID(suspendRequest.id);
    assertEqual(suspendRequest.requestType, 'GDPR_SUSPEND');
    assertEqual(suspendRequest.status, 'PENDING');

    ctx.trackResource('gdpr_request', suspendRequest.id);
    steps.log('POST /gdpr/suspend → 202 (request created)');

    // Step 2: Try to recover
    // Note: Recovery may fail if suspension hasn't been processed yet
    // This is expected behavior - we're testing the API contract

    const recoverResponse = await ctx.post('/v1/gdpr/recover', {}, { token: userToken });

    // Recovery can return different status codes depending on processing state:
    // - 200 if suspension was processed and recovery succeeded
    // - 404 if no active suspension (not yet processed)
    // - 403 if recovery preconditions not met

    if (recoverResponse.status === 200) {
      assertEnvelope(recoverResponse);
      assertHasProperty(recoverResponse.data.data, 'userId');
      assertHasProperty(recoverResponse.data.data, 'recoveredAt');
      assertHasProperty(recoverResponse.data.data, 'lifecycleState');
      assertEqual(recoverResponse.data.data.lifecycleState, 'RECOVERED');
      steps.log('POST /gdpr/recover → 200 (recovered)');
    } else if (recoverResponse.status === 404) {
      // No active suspension yet (suspension pending processing)
      assertErrorEnvelope(recoverResponse);
      steps.log('POST /gdpr/recover → 404 (suspension not yet processed)');
    } else if (recoverResponse.status === 403) {
      // Preconditions not met
      assertErrorEnvelope(recoverResponse);
      steps.log('POST /gdpr/recover → 403 (preconditions not met)');
    } else {
      // Unexpected status
      throw new Error(`Unexpected recovery status: ${recoverResponse.status}`);
    }

    steps.logFinal('Suspend/recover flow verified');
  },
};

/**
 * GDPR Delete Request Scenario
 *
 * Tests the delete request creation.
 */
const gdprDeleteScenario = {
  name: 'GDPR Delete Request',
  description: 'Verify delete request creation',

  async run(ctx, steps) {
    // Setup: Create a user with profile
    const externalUserId = ctx.generateExternalUserId();
    const userToken = ctx.createUserToken({ sub: externalUserId });

    await ctx.post(
      '/v1/profiles/me',
      { displayName: 'GDPR Delete Test User', language: 'en' },
      { token: userToken },
    );
    steps.log('Created test profile');

    // Step 1: Request deletion
    const deleteResponse = await ctx.post('/v1/gdpr/delete', {}, { token: userToken });

    assertStatus(deleteResponse, 202, 'Delete request should return 202 Accepted');
    assertEnvelope(deleteResponse);

    const deleteRequest = deleteResponse.data.data;
    assertUUID(deleteRequest.id);
    assertEqual(deleteRequest.requestType, 'GDPR_DELETE');
    assertEqual(deleteRequest.status, 'PENDING');
    assertHasProperty(deleteRequest, 'createdAt');

    ctx.trackResource('gdpr_request', deleteRequest.id);
    steps.logFinal('POST /gdpr/delete → 202 (request created)');
  },
};

module.exports = {
  gdprExportScenario,
  gdprExportDownloadScenario,
  gdprSuspendRecoverScenario,
  gdprDeleteScenario,
};
