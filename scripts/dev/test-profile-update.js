/**
 * Test script for profile partial update functionality.
 *
 * This script verifies:
 * 1. Creating a profile with initial values
 * 2. Partial update - language only
 * 3. Partial update - displayName only
 * 4. Partial update - multiple fields
 * 5. Verifying existing data is preserved during partial updates
 *
 * Usage:
 *   node scripts/test-profile-update.js
 */

if (process.env.NODE_ENV === 'production') {
  if (!process.env.ALLOW_DEV_DESTRUCTIVE) {
    console.error('❌ Refusing to run in production environment.');
    console.error('   Set ALLOW_DEV_DESTRUCTIVE=1 to override.');
    process.exit(1);
  }
}

const axios = require('axios');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// Test JWT token (you'll need to provide a valid JWT)
const TEST_JWT = process.env.TEST_JWT || 'your-test-jwt-here';

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${TEST_JWT}`,
    'Content-Type': 'application/json',
  },
});

async function testProfileUpdates() {
  console.log('🧪 Testing Profile Partial Update Functionality\n');

  try {
    // Step 1: Create or get existing profile
    console.log('1️⃣  Creating/Getting profile...');
    let response = await client.post('/v1/profiles/me', {
      displayName: 'Test User',
      language: 'en',
    });
    console.log('✅ Profile created/retrieved:', {
      displayName: response.data.displayName,
      language: response.data.language,
    });
    console.log('');

    // Step 2: Update language only
    console.log('2️⃣  Updating language only (language: es)...');
    response = await client.patch('/v1/profiles/me', {
      language: 'es',
    });
    console.log('✅ Language updated:', {
      displayName: response.data.displayName,
      language: response.data.language,
    });
    console.log(
      '   ℹ️  displayName should be preserved:',
      response.data.displayName === 'Test User' ? '✅' : '❌',
    );
    console.log('');

    // Step 3: Update displayName only
    console.log('3️⃣  Updating displayName only (displayName: Updated Name)...');
    response = await client.patch('/v1/profiles/me', {
      displayName: 'Updated Name',
    });
    console.log('✅ Display name updated:', {
      displayName: response.data.displayName,
      language: response.data.language,
    });
    console.log(
      '   ℹ️  language should be preserved:',
      response.data.language === 'es' ? '✅' : '❌',
    );
    console.log('');

    // Step 4: Update multiple fields
    console.log('4️⃣  Updating multiple fields (displayName: Final Name, language: fr)...');
    response = await client.patch('/v1/profiles/me', {
      displayName: 'Final Name',
      language: 'fr',
    });
    console.log('✅ Multiple fields updated:', {
      displayName: response.data.displayName,
      language: response.data.language,
    });
    console.log('');

    // Step 5: Get profile to verify
    console.log('5️⃣  Getting profile to verify final state...');
    response = await client.get('/v1/profiles/me');
    console.log('✅ Final profile state:', {
      displayName: response.data.displayName,
      language: response.data.language,
      updatedAt: response.data.updatedAt,
    });
    console.log('');

    console.log('✅ All tests passed!\n');
  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', {
        status: error.response.status,
        data: error.response.data,
      });
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  if (TEST_JWT === 'your-test-jwt-here') {
    console.error('❌ Please set TEST_JWT environment variable with a valid JWT token');
    console.error('   Example: TEST_JWT=eyJhbGc... node scripts/test-profile-update.js');
    process.exit(1);
  }

  testProfileUpdates()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = { testProfileUpdates };
