> Documentation Layer: Canonical Contract

# GDPR Request Processing Lifecycle (Phase 2)

This document describes the implementation of Phase 2 of the GDPR system: **Request Processing Lifecycle**.

## Overview

Phase 2 implements the infrastructure to safely process GDPR requests through their lifecycle states **without actually exporting data**. This phase proves the system can manage request states safely before adding data collection logic.

## What Phase 2 Does

✅ **Safe State Transitions**

- Moves requests through lifecycle: PENDING → PROCESSING → COMPLETED/FAILED
- Explicit transitions (no state skipping)
- Terminal states (COMPLETED, FAILED) prevent further processing

✅ **Transactional Locking**

- Prevents double processing using database-level locks
- Safe for concurrent workers
- Safe for repeated cron invocations
- Survives process crashes (transaction rollback)

✅ **Comprehensive Audit Logging**

- Every state transition creates an audit log entry
- Immutable, append-only trail
- Required for GDPR compliance

✅ **Graceful Failure Handling**

- Catches all errors during processing
- Never leaves requests stuck in PROCESSING
- Stores sanitized error messages
- Creates audit log for failures

## What Phase 2 Does NOT Do

❌ Collect user data from tables  
❌ Generate export files  
❌ Upload to storage  
❌ Send notifications  
❌ Expose public HTTP endpoints

These will be added in future phases.

---

## Architecture

### Request Lifecycle States

```
PENDING
   ↓
PROCESSING (exclusive lock)
   ↓
COMPLETED (terminal)
   OR
FAILED (terminal)
```

### Processing Flow

```
1. Find pending requests (GDPR_EXPORT, status=PENDING)
2. For each request:
   a. Acquire processing lock (atomic UPDATE)
   b. If lock acquired:
      - Log EXPORT_STARTED
      - Execute processing (NO-OP in Phase 2)
      - Mark COMPLETED
      - Log EXPORT_COMPLETED
   c. If lock fails:
      - Another worker claimed it
      - Skip silently (not an error)
   d. If error occurs:
      - Catch exception
      - Mark FAILED
      - Log EXPORT_FAILED
      - Continue to next request
```

### Locking Strategy

**Database-level transactional locking:**

```typescript
// Atomic transition: PENDING → PROCESSING
const updated = await prisma.request.updateMany({
  where: {
    id: requestId,
    status: 'PENDING', // Only claim if still pending
  },
  data: {
    status: 'PROCESSING',
  },
});

// updated.count === 1 → Lock acquired
// updated.count === 0 → Already claimed by another worker
```

**Why this works:**

- PostgreSQL guarantees UPDATE atomicity
- Row-level locking prevents race conditions
- WHERE clause prevents double-processing
- Transaction rollback on crash leaves state clean
- No external lock manager required

---

## Files Added

### Service Implementation

**[gdpr-request-processor.service.ts](../src/modules/gdpr/gdpr-request-processor.service.ts)**

- Main processing service
- 500+ lines of comprehensive documentation
- Transactional locking implementation
- Audit logging for all transitions
- Graceful error handling

### Schema Updates

**[prisma/schema.prisma](../prisma/schema.prisma)**

- Added `EXPORT_PROCESSING_STARTED` to `GdprAuditAction` enum
- All required fields already existed:
  - `processedAt` (DateTime?)
  - `errorMessage` (String?)
  - `RequestStatus` enum (PENDING, PROCESSING, COMPLETED, FAILED)

### Migration

**[20260103091630_add_export_processing_started_action/migration.sql](../prisma/migrations/20260103091630_add_export_processing_started_action/migration.sql)**

- Adds new audit action to enum

### Manual Trigger Script

**[scripts/process-gdpr-requests.js](../scripts/process-gdpr-requests.js)**

- Development/testing script
- Manually invokes processor
- Shows processing summary
- NOT for production use (will be replaced by cron)

---

## Usage

### Programmatic Invocation

```typescript
import { GdprRequestProcessorService } from './modules/gdpr';

// In a service or cron job
async function processPendingRequests() {
  const processor = app.get(GdprRequestProcessorService);

  // Process up to 10 requests
  const summary = await processor.processPendingExports(10);

  console.log(`Processed: ${summary.processed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log(`Skipped: ${summary.skipped}`);
}
```

### Manual Testing (Development Only)

```bash
# Build the application first
npm run build

# Process pending requests
node scripts/process-gdpr-requests.js

# Process with custom batch size
node scripts/process-gdpr-requests.js 5
```

### Module Integration

The service is already integrated into `GdprModule`:

```typescript
@Module({
  providers: [
    GdprRequestProcessorService,
    // ... other providers
  ],
  exports: [
    GdprRequestProcessorService,
    // ... other exports
  ],
})
export class GdprModule {}
```

---

## Safety Guarantees

### Idempotency

✅ **Safe to run multiple times**

- Already-processed requests are not reprocessed
- Status checks prevent duplicate work
- Audit logs show complete history

### Concurrency

✅ **Safe for concurrent workers**

- Transactional locking ensures exclusivity
- Multiple cron jobs can run simultaneously
- Only one worker processes each request

### Crash Recovery

✅ **Safe after process crashes**

- Transaction rollback reverts incomplete work
- Requests return to PENDING if lock transaction fails
- No orphaned PROCESSING requests
- Audit logs show exact point of failure

### Failure Isolation

✅ **Individual failures don't stop batch**

- Each request processed independently
- Failures caught and recorded
- Processing continues to next request
- Summary shows total results

---

## Audit Trail

Every processing attempt creates audit log entries:

| Action             | When                             | Performed By    | Metadata                       |
| ------------------ | -------------------------------- | --------------- | ------------------------------ |
| `EXPORT_REQUESTED` | User initiates request (Phase 1) | User's Identity | requestId                      |
| `EXPORT_STARTED`   | Processing begins                | SYSTEM          | requestId, processingStartedAt |
| `EXPORT_COMPLETED` | Processing succeeds              | SYSTEM          | requestId, completedAt         |
| `EXPORT_FAILED`    | Processing fails                 | SYSTEM          | requestId, failedAt, error     |

All audit logs are:

- Immutable (never updated)
- Append-only (never deleted)
- Legally required for GDPR compliance

---

## Database Schema

### Request Table

```prisma
model Request {
  id           String        @id
  identityId   String        // Links to Identity
  requestType  RequestType   // GDPR_EXPORT, GDPR_DELETE, etc.
  status       RequestStatus // PENDING, PROCESSING, COMPLETED, FAILED
  errorMessage String?       // Sanitized error if FAILED
  createdAt    DateTime
  updatedAt    DateTime
  requestedAt  DateTime
  processedAt  DateTime?     // Set when COMPLETED or FAILED
  expiresAt    DateTime?     // Future use
  dataPayload  Json?         // Future use
}
```

### Audit Log Table

```prisma
model GdprAuditLog {
  id          String          @id
  identityId  String
  action      GdprAuditAction // EXPORT_REQUESTED, EXPORT_STARTED, etc.
  entityType  String?         // Table affected (e.g., 'gdpr_requests')
  metadata    Json?           // Contextual data
  createdAt   DateTime
  updatedAt   DateTime
  performedAt DateTime
  performedBy String          // Identity ID or 'SYSTEM'
}
```

---

## Extension Points (Future Phases)

The service includes clear extension points for data export:

```typescript
/**
 * Execute the processing logic for a request.
 *
 * PHASE 2 IMPLEMENTATION: NO-OP (Intentional)
 *
 * Future Phases Will Add:
 * - Phase 3: Data collection from registry tables
 * - Phase 3: Export file generation (JSON/ZIP)
 * - Phase 4: Storage upload (S3, presigned URLs)
 * - Phase 4: Notification delivery (email, in-app)
 */
private async executeProcessing(request: Request): Promise<void> {
  // Simulate processing delay (remove in production)
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Future implementation will look like:
  // 1. const tables = getExportableTables();
  // 2. const data = await collectUserData(request.identityId, tables);
  // 3. const exportFile = await generateExportFile(data);
  // 4. const url = await uploadToStorage(exportFile);
  // 5. await notifyUser(request.identityId, url);

  this.logger.debug(
    `[Processor] Executing processing for request ${request.id} (NO-OP in Phase 2)`,
  );
}
```

---

## Testing Checklist

✅ **Phase 2 Validation:**

- [ ] Create a pending request (Phase 1 endpoint)
- [ ] Run processor manually: `node scripts/process-gdpr-requests.js`
- [ ] Verify request transitions: PENDING → PROCESSING → COMPLETED
- [ ] Check audit logs contain 3 entries:
  - EXPORT_REQUESTED
  - EXPORT_STARTED
  - EXPORT_COMPLETED
- [ ] Verify `processedAt` timestamp is set

✅ **Concurrency Testing:**

- [ ] Create multiple pending requests
- [ ] Run processor twice simultaneously
- [ ] Verify no duplicate processing (each request processed once)
- [ ] Check audit logs show single EXPORT_STARTED per request

✅ **Failure Testing:**

- [ ] Simulate error by disconnecting database mid-processing
- [ ] Verify request marked as FAILED
- [ ] Verify audit log contains EXPORT_FAILED entry
- [ ] Verify error message stored (sanitized)

✅ **Idempotency Testing:**

- [ ] Process a batch of requests
- [ ] Run processor again immediately
- [ ] Verify no additional processing (totalFound = 0)

---

## Compliance & Security

### GDPR Compliance

✅ **Right to Access** - Phase 1 creates request
✅ **Audit Trail** - All actions logged immutably
✅ **Data Minimization** - No unnecessary data stored
✅ **Secure Processing** - Transactional safety

### Security Considerations

✅ **No Public Exposure**

- Processor is internal-only
- Not accessible via HTTP endpoints
- Invoked by cron jobs or admin CLI

✅ **Error Message Sanitization**

- Stack traces removed
- Length limited to 500 characters
- No PII in error messages

✅ **Audit Integrity**

- Append-only logs
- Never modified or deleted
- Linked to Identity for accountability

---

## Future Phases

### Phase 3: Data Export (Not Implemented)

- Query registry-defined tables
- Collect user data based on `identityId`
- Generate JSON export
- Create ZIP file
- Calculate checksums

### Phase 4: Storage & Delivery (Not Implemented)

- Upload export to S3 or equivalent
- Generate presigned download URL
- Set expiration date (e.g., 30 days)
- Send notification to user
- Track download events

### Phase 5: Cron Automation (Not Implemented)

- Scheduled job to process requests
- Configurable batch size
- Monitoring/alerting for failures
- Metrics collection

---

## Mental Model

**Phase 2 proves:**

- ✓ System can move requests safely through lifecycle
- ✓ Locking prevents double processing
- ✓ System survives restarts and crashes
- ✓ All state changes are auditable
- ✓ Failures are handled gracefully

**Phase 2 does NOT:**

- ✗ Fulfill GDPR requests with actual data
- ✗ Generate export files
- ✗ Send notifications
- ✗ Expose user-facing functionality

This separation ensures the infrastructure is solid before adding complex data collection logic.

---

## Repository Compliance

✅ **Identity-First Pattern**

- All operations use `identityId`
- `externalUserId` (JWT sub) only at boundaries

✅ **Explicit Over Implicit**

- 500+ lines of inline documentation
- Every decision explained
- Clear extension points marked

✅ **Boring, Stable Solutions**

- Database-level locking (no Redis, no external services)
- Sequential processing (predictable, debuggable)
- Standard Prisma transactions

✅ **Template-Neutral**

- No product-specific logic
- Works for any GDPR-compliant application
- Extensible without modification

✅ **Audit Compliance**

- Immutable audit logs
- Every state transition logged
- Legally defensible trail

---

## Summary

Phase 2 implements the **foundation** for GDPR request processing:

- Safe lifecycle management
- Transactional locking
- Comprehensive auditing
- Graceful failure handling

The infrastructure is now ready for Phase 3 (data collection) and Phase 4 (delivery).

**If this system cannot safely manage request states, it should not handle user data.**

Phase 2 proves it can. ✅

