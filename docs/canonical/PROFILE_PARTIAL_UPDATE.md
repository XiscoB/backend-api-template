> Documentation Layer: Canonical Contract

# Profile Partial Update Implementation

## Overview

Implemented dynamic and partial user profile updates to support tab-based, incremental profile editing. The backend now allows updating one or more profile fields independently while preserving existing data.

## Implementation Details

### 1. New DTO: UpdateProfileDto

**Location**: [src/modules/profiles/v1/dto/update-profile.dto.ts](src/modules/profiles/v1/dto/update-profile.dto.ts)

All fields are optional, enabling partial updates:

- `displayName?: string` - Optional display name (2-100 chars)
- `language?: string` - Optional language (ISO 639-1 code)

Validation remains strict using `class-validator`.

### 2. New PATCH Endpoint

**Endpoint**: `PATCH /api/v1/profiles/me`

**Location**: [src/modules/profiles/v1/profiles.controller.ts](src/modules/profiles/v1/profiles.controller.ts)

Supports partial profile updates with proper HTTP semantics.

**Examples**:

```json
// Update language only
PATCH /api/v1/profiles/me
{ "language": "es" }

// Update display name only
PATCH /api/v1/profiles/me
{ "displayName": "Xisco" }

// Update multiple fields
PATCH /api/v1/profiles/me
{ "displayName": "Xisco", "language": "es" }
```

### 3. Service Layer Updates

**Location**: [src/modules/profiles/profiles.service.ts](src/modules/profiles/profiles.service.ts)

**New Method**: `updateMyProfile(externalUserId, dto)`

- Resolves Identity at boundary
- Validates profile exists
- Performs partial update via repository
- Syncs language changes to notification profile (best-effort)
- Returns updated profile with Identity relation

**Language Sync**: When language is updated, it's automatically synchronized to the user's notification profile to ensure notifications are delivered in the correct language.

### 4. Repository Layer Updates

**Location**: [src/modules/profiles/profiles.repository.ts](src/modules/profiles/profiles.repository.ts)

**New Method**: `updatePartial(id, data)`

- Builds update object with only provided fields
- Explicitly handles undefined vs null
- Preserves existing data for missing fields
- Uses Prisma's update API for safe, atomic updates

### 5. Notification Profile Integration

**Location**: [src/modules/notifications/notification-profile.service.ts](src/modules/notifications/notification-profile.service.ts)

**New Method**: `updateLanguage(identityId, language)`

Convenience method for syncing language preference from user profile to notification profile.

## Key Features

### ✅ Partial Updates

- Update one field: `{ "language": "es" }`
- Update multiple fields: `{ "displayName": "Name", "language": "es" }`
- Missing fields preserve existing data

### ✅ Idempotent & Safe

- Updates are atomic via Prisma
- Only provided fields are touched
- Explicit handling of undefined values

### ✅ Strict Validation

- All DTOs use class-validator
- No loose objects or generic payloads
- Type-safe at compile time

### ✅ Backend as Source of Truth

- No UI-specific logic in services
- Clean separation of concerns
- No tabs/screens/flows in backend

### ✅ Notification Sync

- Language changes sync to notification profile
- Best-effort approach (doesn't fail profile update)
- Ensures notifications use correct language

## Testing

A test script is provided: [scripts/test-profile-update.js](scripts/test-profile-update.js)

**Usage**:

```bash
TEST_JWT=your-jwt-token node scripts/test-profile-update.js
```

The script tests:

1. Profile creation with initial values
2. Language-only update
3. DisplayName-only update
4. Multiple field update
5. Verification that existing data is preserved

## API Contract

### PATCH /api/v1/profiles/me

**Request Body** (all fields optional):

```typescript
{
  displayName?: string;  // 2-100 chars
  language?: string;     // ISO 639-1 code (e.g., "en", "es")
}
```

**Response** (200 OK):

```typescript
{
  id: string;
  externalUserId: string;
  displayName: string;
  language: string;
  createdAt: string;
  updatedAt: string;
}
```

**Errors**:

- `404 Not Found` - Profile doesn't exist (must create first via POST)
- `400 Bad Request` - Validation failed
- `401 Unauthorized` - Invalid/missing JWT

## Architecture Compliance

✅ **Template-neutral**: No project-specific logic  
✅ **Identity-first**: Uses Identity as ownership root  
✅ **Boring solution**: Explicit, readable, maintainable  
✅ **DTO validation**: Strict class-validator usage  
✅ **Service isolation**: No auth logic, no UI concerns  
✅ **Repository pattern**: Database access encapsulated

## Migration Notes

**Existing endpoints unchanged**:

- `GET /api/v1/profiles/me` - Still works as before
- `POST /api/v1/profiles/me` - Still creates/returns profile (idempotent)

**New endpoint**:

- `PATCH /api/v1/profiles/me` - New partial update endpoint

**No database changes required** - uses existing Profile schema.

## Use Cases

### Tab-Based Profile Editing

Different app sections can update profile independently:

```typescript
// Language settings tab
await api.patch('/api/v1/profiles/me', { language: 'es' });

// Profile details screen
await api.patch('/api/v1/profiles/me', { displayName: 'New Name' });

// Onboarding flow (multiple fields)
await api.patch('/api/v1/profiles/me', {
  displayName: 'User',
  language: 'en',
});
```

### Incremental Updates

Progressive profile completion:

```typescript
// Step 1: Create basic profile
POST /api/v1/profiles/me { displayName: 'User' }

// Step 2: User sets language preference later
PATCH /api/v1/profiles/me { language: 'fr' }

// Step 3: User updates name later
PATCH /api/v1/profiles/me { displayName: 'Full Name' }
```

## Definition of Done

✅ Single, clear profile update endpoint exists  
✅ Partial updates work correctly  
✅ DTOs are explicit and validated  
✅ Existing profile data is preserved unless explicitly updated  
✅ Code remains boring, readable, and maintainable  
✅ Language sync to notification profile  
✅ Test script provided  
✅ No auth logic introduced  
✅ No UI-specific concerns in backend  
✅ Template neutrality preserved

