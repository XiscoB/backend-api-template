> Documentation Layer: Canonical Contract

# GDPR Data Export & Deletion

This document describes the GDPR compliance features implementation.

## Overview

The GDPR module provides GDPR compliance primitives for the backend API:

- ✅ **Data Export**: Users can request a GDPR data export
- ✅ **Data Deletion**: Users can request erasure of their personal data
- ✅ **Background Processing**: Operations are processed asynchronously
- ✅ **Audit Logging**: All GDPR operations are logged for compliance
- ✅ **Registry Enforcement**: Validates all user data tables are properly declared

### Design Philosophy

This is a **base backend template**, not a product. The GDPR module provides:

- Minimal, extensible primitives
- No opinionated delivery mechanisms
- No UX assumptions (download/listing/notification endpoints)

Products extending this template should add their own:

- Download endpoints (S3 presigned URLs, email, direct download, etc.)
- Status checking endpoints
- Notification mechanisms

### Implemented Features

| Feature            | Status              | Endpoint                   |
| ------------------ | ------------------- | -------------------------- |
| Data Export        | ✅ Implemented      | `POST /api/v1/gdpr/export` |
| Data Deletion      | ✅ Implemented      | `POST /api/v1/gdpr/delete` |
| Delivery mechanism | ❌ Product-specific | —                          |

## Architecture

### Components

```
src/modules/gdpr/
├── gdpr.module.ts           # NestJS module definition
├── gdpr.registry.ts         # Table declarations for GDPR
├── gdpr.types.ts            # TypeScript interfaces
├── gdpr.repository.ts       # Database access layer
├── gdpr-export.service.ts   # Export business logic
├── gdpr-deletion.service.ts # Deletion business logic
├── gdpr-enforcement.service.ts  # Registry validation
├── gdpr-cron.service.ts     # Background processing methods
├── index.ts                 # Module exports
└── v1/
    ├── gdpr.controller.ts   # HTTP endpoints
    └── dto/                 # Request/Response DTOs
```

### Data Flow

1. **User requests export** → `POST /api/v1/gdpr/export`
   - Creates a PENDING request in `requests` table
   - Logs `EXPORT_REQUESTED` in `gdpr_audit_logs`
   - Returns request ID and status (202 Accepted)

2. **Background processing** → Called by cron job
   - `GdprCronService.processPendingExports()`
   - Collects data from all registered tables
   - Logs `EXPORT_COMPLETED` or `EXPORT_FAILED`
   - **Note**: Export data is NOT stored by default (product-specific concern)

3. **Delivery** → Product-specific
   - Extend the template to add your delivery mechanism
   - Options: Email, S3 presigned URLs, direct download, etc.

## GDPR Registry

The registry (`gdpr.registry.ts`) is the **single source of truth** for which tables contain user data.

### Registering a Table

Add entries to `GDPR_REGISTRY`:

```typescript
export const GDPR_REGISTRY: readonly GdprTableConfig[] = [
  {
    modelName: 'Profile', // Prisma model name (PascalCase)
    tableName: 'profiles', // Database table name (snake_case)
    userField: 'externalUserId', // Prisma field linking to user
    export: true, // Include in data exports
    delete: {
      strategy: 'ANONYMIZE', // 'DELETE' | 'ANONYMIZE'
      fields: ['displayName'],
      replacement: 'FIXED', // 'NULL' | 'RANDOM' | 'FIXED'
    },
    description: 'User profile data',
  },
  // Add new tables here...
];
```

### Excluding Infrastructure Tables

Tables that have `externalUserId` but should NOT be included in GDPR operations:

```typescript
export const GDPR_EXCLUDED_TABLES: readonly string[] = [
  'Request', // Generic request table - infrastructure
  'GdprAuditLog', // Audit logs must be retained for legal reasons
];
```

### Enforcement

The `GdprEnforcementService` checks at startup:

- Scans all Prisma models for `externalUserId` field
- Verifies each is either registered in `GDPR_REGISTRY` or excluded
- **Development**: Logs a BIG WARNING
- **Production**: Throws error to prevent startup

This ensures no user data table is accidentally missed.

## API Endpoints

### Request Export

```
POST /api/v1/gdpr/export
Authorization: Bearer <jwt>
```

Response (202 Accepted):

```json
{
  "data": {
    "id": "uuid",
    "requestType": "GDPR_EXPORT",
    "status": "PENDING",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Note**: This is the only endpoint in v1. Products should extend with:

- `GET /export/:id` - Status checking
- `GET /export/:id/download` - Download (if using direct download)
- `GET /export` - List user's requests

## Background Processing

The module provides cron-compatible methods but **does not include scheduling**.

### Integration Options

**Option 1: External Cron (Recommended for production)**

```bash
# Kubernetes CronJob, AWS EventBridge, etc.
# Create an internal endpoint and call it
curl -X POST http://localhost:3000/api/internal/gdpr/process
```

**Option 2: @nestjs/schedule (If needed)**

```typescript
import { Cron } from '@nestjs/schedule';
import { GdprCronService } from './modules/gdpr';

@Injectable()
export class TasksService {
  constructor(private gdprCron: GdprCronService) {}

  @Cron('*/5 * * * *') // Every 5 minutes
  async processExports() {
    await this.gdprCron.processPendingExports();
  }
}
```

### Available Methods

```typescript
// Process pending export requests (batch processing)
await gdprCronService.processPendingExports(batchSize?: number);
// Returns: { processed: number, durationMs: number }

// Process pending deletion requests (batch processing)
await gdprCronService.processPendingDeletions(batchSize?: number);
// Returns: { processed: number, durationMs: number }
```

## Database Schema

### requests (Generic Request Table)

| Column           | Type      | Description                            |
| ---------------- | --------- | -------------------------------------- |
| id               | UUID      | Primary key                            |
| external_user_id | TEXT      | User identifier (JWT sub)              |
| request_type     | ENUM      | GDPR_EXPORT, GDPR_DELETE               |
| status           | ENUM      | PENDING, PROCESSING, COMPLETED, FAILED |
| error_message    | TEXT      | Error details if failed                |
| created_at       | TIMESTAMP | When request was created               |
| updated_at       | TIMESTAMP | Last update timestamp                  |

### gdpr_audit_logs

| Column           | Type      | Description                             |
| ---------------- | --------- | --------------------------------------- |
| id               | UUID      | Primary key                             |
| external_user_id | TEXT      | User identifier (JWT sub)               |
| action           | ENUM      | EXPORT\_\*, DELETE                      |
| entity_type      | TEXT      | Affected table (optional)               |
| metadata         | JSONB     | Additional context (request ID, etc.)   |
| performed_at     | TIMESTAMP | When action occurred                    |
| performed_by     | TEXT      | Who performed action (user or 'SYSTEM') |

## Adding New Tables

When adding a new table with user data:

1. Add `externalUserId` field (maps to `external_user_id` in DB)
2. Register in `GDPR_REGISTRY`
3. The export service will automatically include it

Example:

```prisma
model UserPreference {
  id             String   @id @default(uuid()) @db.Uuid
  externalUserId String   @map("external_user_id")
  theme          String   @default("light")
  createdAt      DateTime @default(now()) @map("created_at")

  @@map("user_preferences")
}
```

```typescript
// In gdpr.registry.ts
{
  modelName: 'UserPreference',
  tableName: 'user_preferences',
  userField: 'externalUserId',
  export: true,
  delete: {
    strategy: 'DELETE', // Hard delete all rows
  },
  description: 'User preferences',
},
```

## Extending for Products

This base template provides primitives. Products should extend:

### Adding Download Endpoint

```typescript
// In your product's gdpr.controller.ts
@Get('export/:id/download')
async downloadExport(
  @CurrentUser() user: AuthenticatedUser,
  @Param('id') requestId: string,
): Promise<GdprExportDataDto> {
  // Verify ownership, retrieve data, return
}
```

### Adding Storage

Extend `GdprExportService.processExportRequest()` to:

- Store export data (S3, database, filesystem)
- Set expiration
- Trigger notification

### Adding Notifications

After export completion:

- Send email with download link
- Push notification
- Webhook to external system

## Security Considerations

- Users can only request exports for themselves (JWT `sub` claim)
- All operations are audit logged with immutable timestamps
- No sensitive auth data is ever exported (handled by identity provider)
- Audit logs are immutable and never deleted (legal requirement)
- Rate limiting should be applied at infrastructure level

