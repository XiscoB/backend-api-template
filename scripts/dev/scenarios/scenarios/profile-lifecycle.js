/**
 * Profile Lifecycle Scenarios
 *
 * Scenario 1: First Login / Profile Creation
 *
 * Tests:
 * - GET /api/v1/profiles/me → 404 (no profile)
 * - POST /api/v1/profiles/me → 200 (create)
 * - GET /api/v1/profiles/me → 200 (retrieve)
 * - PATCH /api/v1/profiles/me → 200 (partial update)
 *
 * @see TEST_UI_CONTRACT.md Section 4.2 and Scenario 1
 */

const {
  assertStatus,
  assertEnvelope,
  assertErrorEnvelope,
  assertHasProperty,
  assertUUID,
  assertEqual,
} = require('../lib/assertions');

/**
 * Scenario 1: First Login / Profile Creation
 *
 * Per TEST_UI_CONTRACT.md Section 9 - Scenario 1
 */
const profileCreationScenario = {
  name: 'Scenario 1: First Login / Profile Creation',
  description: 'Verify profile create/retrieve lifecycle works as documented',

  async run(ctx, steps) {
    // Generate a unique user for this test
    const externalUserId = ctx.generateExternalUserId();
    const userToken = ctx.createUserToken({ sub: externalUserId });

    // Step 1: GET /profiles/me should return 404 (no profile yet)
    const getResponse1 = await ctx.get('/v1/profiles/me', { token: userToken });

    assertStatus(getResponse1, 404, 'New user should not have profile');
    assertErrorEnvelope(getResponse1, 'RESOURCE_NOT_FOUND');
    steps.log('GET /profiles/me (no profile) → 404 RESOURCE_NOT_FOUND');

    // Step 2: POST /profiles/me to create profile
    const createPayload = {
      displayName: `Scenario Test ${externalUserId.slice(-6)}`,
      language: 'en',
    };

    const createResponse = await ctx.post('/v1/profiles/me', createPayload, { token: userToken });

    assertStatus(createResponse, 200, 'Profile creation should succeed');
    assertEnvelope(createResponse, 'Create response should be wrapped');

    const profile = createResponse.data.data;
    assertUUID(profile.id, 'Profile ID should be UUID');
    assertEqual(profile.displayName, createPayload.displayName, 'displayName should match');
    assertEqual(profile.language, createPayload.language, 'language should match');
    assertHasProperty(profile, 'createdAt');
    assertHasProperty(profile, 'updatedAt');

    ctx.trackResource('profile', profile.id, { externalUserId });
    steps.log('POST /profiles/me → 200 (profile created)');

    // Step 3: GET /profiles/me should return the profile
    const getResponse2 = await ctx.get('/v1/profiles/me', { token: userToken });

    assertStatus(getResponse2, 200, 'Profile retrieval should succeed');
    assertEnvelope(getResponse2, 'Get response should be wrapped');

    const retrievedProfile = getResponse2.data.data;
    assertEqual(retrievedProfile.id, profile.id, 'Should retrieve same profile');
    assertEqual(retrievedProfile.displayName, createPayload.displayName);
    steps.log('GET /profiles/me → 200 (same profile)');

    // Step 4: POST again should be idempotent (return existing profile)
    const duplicateResponse = await ctx.post('/v1/profiles/me', createPayload, {
      token: userToken,
    });

    assertStatus(duplicateResponse, 200, 'Duplicate POST should succeed (idempotent)');
    assertEqual(duplicateResponse.data.data.id, profile.id, 'Should return same profile ID');
    steps.logFinal('POST /profiles/me (again) → 200 (idempotent)');
  },
};

/**
 * Profile Partial Update Scenario
 *
 * Per TEST_UI_CONTRACT.md Section 4.2 - PATCH /api/v1/profiles/me
 */
const profileUpdateScenario = {
  name: 'Profile Partial Update',
  description: 'Verify PATCH updates only provided fields and preserves others',

  async run(ctx, steps) {
    // Setup: Create a profile first
    const externalUserId = ctx.generateExternalUserId();
    const userToken = ctx.createUserToken({ sub: externalUserId });

    await ctx.post(
      '/v1/profiles/me',
      { displayName: 'Original Name', language: 'en' },
      { token: userToken },
    );
    steps.log('Created test profile');

    // Step 1: Update language only
    const patchResponse1 = await ctx.patch(
      '/v1/profiles/me',
      { language: 'es' },
      { token: userToken },
    );

    assertStatus(patchResponse1, 200, 'PATCH should succeed');
    assertEnvelope(patchResponse1);

    const afterLangUpdate = patchResponse1.data.data;
    assertEqual(afterLangUpdate.language, 'es', 'language should be updated');
    assertEqual(afterLangUpdate.displayName, 'Original Name', 'displayName should be preserved');
    steps.log('PATCH language only → displayName preserved');

    // Step 2: Update displayName only
    const patchResponse2 = await ctx.patch(
      '/v1/profiles/me',
      { displayName: 'Updated Name' },
      { token: userToken },
    );

    assertStatus(patchResponse2, 200, 'PATCH should succeed');

    const afterNameUpdate = patchResponse2.data.data;
    assertEqual(afterNameUpdate.displayName, 'Updated Name', 'displayName should be updated');
    assertEqual(afterNameUpdate.language, 'es', 'language should be preserved');
    steps.log('PATCH displayName only → language preserved');

    // Step 3: Update both fields
    const patchResponse3 = await ctx.patch(
      '/v1/profiles/me',
      { displayName: 'Final Name', language: 'fr' },
      { token: userToken },
    );

    assertStatus(patchResponse3, 200, 'PATCH should succeed');

    const finalProfile = patchResponse3.data.data;
    assertEqual(finalProfile.displayName, 'Final Name');
    assertEqual(finalProfile.language, 'fr');
    steps.logFinal('PATCH both fields → both updated');
  },
};

module.exports = {
  profileCreationScenario,
  profileUpdateScenario,
};
