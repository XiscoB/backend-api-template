> Documentation Layer: Canonical Contract

# GDPR Export Delivery & Access Control (Phase 5)

This document describes **Phase 5** of the GDPR system: secure delivery, access control, and expiry of GDPR exports using AWS S3.

---

## Overview

Phase 5 provides:

1. **Secure download endpoint** - Presigned URL generation for authenticated users
2. **Access control** - Users can only access their own exports
3. **Expiry enforcement** - Expired exports return 410 Gone
4. **Audit logging** - All download attempts are tracked
5. **AWS S3 integration** - Production-ready storage with presigned URLs

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         GdprController                                  │
│  GET /exports/:requestId         GET /exports/:requestId/download       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     GdprExportDeliveryService                           │
│                                                                         │
│  • Ownership verification (identityId check)                           │
│  • Status validation (COMPLETED only)                                  │
│  • Expiry enforcement                                                   │
│  • Audit logging                                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      GdprS3StorageAdapter                               │
│                                                                         │
│  • AWS S3 client                                                        │
│  • Presigned URL generation                                             │
│  • File operations (store, retrieve, delete)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Environment Variables

### Required for S3 Storage

| Variable                | Description    | Example           |
| ----------------------- | -------------- | ----------------- |
| `AWS_REGION`            | AWS region     | `eu-west-1`       |
| `AWS_S3_BUCKET`         | S3 bucket name | `my-gdpr-exports` |
| `AWS_ACCESS_KEY_ID`     | AWS access key | `AKIA...`         |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | `wJal...`         |

### Optional Configuration

| Variable                         | Default | Description                    |
| -------------------------------- | ------- | ------------------------------ |
| `GDPR_EXPORT_TTL_DAYS`           | `7`     | Days before export expires     |
| `GDPR_PRESIGNED_URL_TTL_SECONDS` | `300`   | Presigned URL lifetime (5 min) |

---

## API Endpoints

### Get Export Status

```
GET /api/v1/gdpr/exports/:requestId
Authorization: Bearer <jwt>
```

**Response (200 OK)**:

```json
{
  "requestId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "COMPLETED",
  "createdAt": "2026-01-03T12:00:00.000Z",
  "completedAt": "2026-01-03T12:01:00.000Z",
  "expiresAt": "2026-01-10T12:00:00.000Z",
  "downloadAvailable": true
}
```

**Error Responses**:

- `403 Forbidden` - User doesn't own this request
- `404 Not Found` - Request doesn't exist

---

### Download Export

```
GET /api/v1/gdpr/exports/:requestId/download
Authorization: Bearer <jwt>
```

**Response (200 OK)**:

```json
{
  "downloadUrl": "https://bucket.s3.region.amazonaws.com/key?X-Amz-Signature=...",
  "expiresAt": "2026-01-03T12:05:00.000Z",
  "filename": "gdpr-export-abc123-20260103T120000Z.zip",
  "fileSize": 1234567
}
```

**Error Responses**:

- `403 Forbidden` - User doesn't own this request
- `404 Not Found` - Request doesn't exist or not completed
- `410 Gone` - Export has expired

---

## Security Model

### Access Control

- **Ownership check**: Users can ONLY access their own exports
- **Identity resolution**: JWT `sub` → Identity → Request ownership
- **No admin override**: ADMIN/SYSTEM roles do NOT have access

### Presigned URLs

- **Generated on demand**: Never stored in database
- **Short-lived**: 5 minutes default (configurable)
- **One-time use intent**: URLs are for immediate download
- **Never logged**: URL contents are not written to logs

### Expiry Enforcement

- **Request-time check**: Expiry verified on every download attempt
- **Automatic status update**: Expired requests marked as EXPIRED
- **Best-effort cleanup**: Files deleted from S3 on expiry detection
- **Audit trail**: All expiry events logged

---

## Audit Actions

| Action                      | Description                |
| --------------------------- | -------------------------- |
| `EXPORT_DOWNLOAD_REQUESTED` | Download attempt initiated |
| `EXPORT_DOWNLOAD_GRANTED`   | Presigned URL generated    |
| `EXPORT_EXPIRED`            | Export marked as expired   |
| `EXPORT_DELETED`            | File deleted from storage  |

---

## Components

### GdprS3StorageAdapter

**Location**: `src/modules/gdpr/gdpr-s3-storage.adapter.ts`

AWS S3 storage implementation with:

- Private-by-default storage
- Server-side encryption (AES256)
- Metadata tagging for lifecycle policies
- Presigned URL generation

**Key Methods**:

```typescript
// Store export file
store(buffer: Buffer, metadata: GdprExportStorageMetadata): Promise<GdprExportStorageResult>

// Generate presigned download URL
generatePresignedUrl(storageKey: string, ttlSeconds?: number): Promise<PresignedUrlResult>

// Delete file
delete(storageKey: string): Promise<boolean>
```

### GdprExportDeliveryService

**Location**: `src/modules/gdpr/gdpr-export-delivery.service.ts`

Orchestrates secure delivery with:

- Identity resolution from JWT
- Ownership verification
- Expiry enforcement
- Audit logging

**Key Methods**:

```typescript
// Authorize download and get presigned URL
authorizeDownload(requestId: string, externalUserId: string): Promise<DownloadAuthorizationResult>

// Get export status
getExportStatus(requestId: string, externalUserId: string): Promise<ExportStatusResult>
```

---

## S3 Configuration

### Bucket Policy (Recommended)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyPublicAccess",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-gdpr-exports/*",
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

### Lifecycle Policy (Recommended)

Configure S3 lifecycle rules to auto-delete old exports:

```json
{
  "Rules": [
    {
      "ID": "ExpireGdprExports",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "gdpr-exports/"
      },
      "Expiration": {
        "Days": 30
      }
    }
  ]
}
```

### IAM Policy (Minimum Required)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:HeadObject"],
      "Resource": "arn:aws:s3:::my-gdpr-exports/gdpr-exports/*"
    }
  ]
}
```

---

## Development vs Production

### Development (Local Filesystem)

Default configuration uses `GdprLocalStorageAdapter`:

- Files stored in `./storage/gdpr-exports/`
- No S3 credentials required
- Presigned URLs not available (direct file access)

### Production (AWS S3)

To enable S3 in production:

1. Set all required environment variables
2. The `GdprS3StorageAdapter` auto-initializes when credentials are present
3. Update module provider if needed:

```typescript
{
  provide: GDPR_EXPORT_STORAGE,
  useFactory: (s3Adapter: GdprS3StorageAdapter, localAdapter: GdprLocalStorageAdapter) => {
    return s3Adapter.isS3Configured() ? s3Adapter : localAdapter;
  },
  inject: [GdprS3StorageAdapter, GdprLocalStorageAdapter],
}
```

---

## Error Handling

### Download Authorization Flow

```
1. User requests download
   │
   ├─ Identity not found → 403 Forbidden
   │
   ├─ Request not found → 404 Not Found
   │
   ├─ Wrong owner → 403 Forbidden (audited)
   │
   ├─ Status != COMPLETED
   │   ├─ FAILED → 404 Not Found
   │   ├─ EXPIRED → 410 Gone
   │   └─ Other → 404 (not ready)
   │
   ├─ Export expired (by date)
   │   ├─ Update status to EXPIRED
   │   ├─ Delete file (best effort)
   │   └─ Return 410 Gone
   │
   └─ Valid → Generate presigned URL → 200 OK
```

---

## Testing

### Unit Tests

```typescript
describe('GdprExportDeliveryService', () => {
  it('authorizes download for valid request', async () => {
    const result = await service.authorizeDownload(requestId, userId);
    expect(result.authorized).toBe(true);
    expect(result.downloadUrl).toBeDefined();
  });

  it('denies access for wrong user', async () => {
    const result = await service.authorizeDownload(requestId, wrongUserId);
    expect(result.authorized).toBe(false);
    expect(result.errorCode).toBe('FORBIDDEN');
  });

  it('returns 410 for expired export', async () => {
    const result = await service.authorizeDownload(expiredRequestId, userId);
    expect(result.authorized).toBe(false);
    expect(result.errorCode).toBe('EXPIRED');
  });
});
```

### Integration Tests

```typescript
describe('GDPR Download Endpoint', () => {
  it('GET /exports/:id/download returns presigned URL', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/gdpr/exports/${requestId}/download`)
      .set('Authorization', `Bearer ${jwt}`)
      .expect(200);

    expect(response.body.downloadUrl).toMatch(/^https:\/\/.*s3.*\.amazonaws\.com/);
  });
});
```

---

## Phase 5 Boundaries

### ✅ Phase 5 DOES

- Generate presigned download URLs
- Verify user ownership
- Check export status
- Enforce expiry
- Emit audit logs
- Delete expired files

### ❌ Phase 5 does NOT

- Render exports (Phase 4)
- Package ZIP files (Phase 4)
- Store files (Phase 4)
- Collect data (Phase 3)
- Build documents (Phase 3.5)
- Send notification emails
- Implement background cleanup jobs

---

## Future Enhancements

### Background Cleanup Job

A cron job to proactively delete expired exports:

```typescript
@Cron('0 0 * * *') // Daily at midnight
async cleanupExpiredExports(): Promise<void> {
  const expired = await prisma.request.findMany({
    where: {
      status: 'COMPLETED',
      expiresAt: { lt: new Date() },
    },
  });

  for (const request of expired) {
    // Delete file and update status
  }
}
```

### Download Notifications

Notify users when their export is ready:

```typescript
await notificationService.send({
  type: 'GDPR_EXPORT_READY',
  identityId,
  payload: { requestId, expiresAt },
});
```

---

## Dependencies

- `@aws-sdk/client-s3` - AWS S3 client
- `@aws-sdk/s3-request-presigner` - Presigned URL generation

---

## References

- [GDPR Export Packaging (Phase 4)](./GDPR_EXPORT_PACKAGING.md)
- [GDPR Data Collection (Phase 3)](./GDPR_DATA_COLLECTION.md)
- [Create Tables Guideline](./create_tables_guideline.md)
- [AWS S3 Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)

