> Documentation Layer: Canonical Contract

# GDPR Export Rendering, Packaging & Storage (Phase 4)

This document describes **Phase 4** of the GDPR system: transforming semantic export documents into downloadable files and storing them securely.

---

## Overview

Phase 4 receives a **GdprExportDocument** (from Phase 3.5) and:

1. **Renders** it to self-contained HTML
2. **Packages** the HTML into a ZIP archive
3. **Stores** the ZIP securely
4. **Persists** export metadata
5. **Marks** the request as COMPLETED
6. **Emits** audit logs for each step

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     GdprExportPipelineService                           │
│                         (Orchestrator)                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  GdprHtmlRenderer│     │GdprExportPackager│     │ GdprExportStorage│
│                 │     │                 │     │   (Interface)   │
│  Document → HTML│     │   HTML → ZIP    │     │  ZIP → Storage  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                        ┌───────────────┴───────────────┐
                                        │                               │
                              ┌─────────────────┐             ┌─────────────────┐
                              │GdprLocalStorage │             │ (S3 Adapter)    │
                              │    Adapter      │             │  (Production)   │
                              └─────────────────┘             └─────────────────┘
```

---

## Components

### 1. GdprHtmlRenderer

**Purpose**: Converts `GdprExportDocument` into self-contained HTML.

**Location**: `src/modules/gdpr/gdpr-html-renderer.service.ts`

**Features**:

- Self-contained output (all CSS/JS inline)
- Works offline (no external dependencies)
- Print-friendly design
- Semantic HTML for accessibility
- Progressive enhancement (works without JavaScript)
- XSS-safe string escaping
- Collapsible sections for large exports

**Output Format**:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Your Data Export</title>
    <style>
      /* Inline CSS */
    </style>
  </head>
  <body>
    <header>...</header>
    <nav class="toc">...</nav>
    <main>
      <section>...</section>
    </main>
    <footer>...</footer>
    <script>
      /* Inline JS */
    </script>
  </body>
</html>
```

---

### 2. GdprExportPackager

**Purpose**: Creates ZIP archives from rendered HTML.

**Location**: `src/modules/gdpr/gdpr-export-packager.service.ts`

**Features**:

- Uses `archiver` library for streaming ZIP creation
- Memory-efficient (streaming, not buffering)
- Configurable compression level (default: 6)
- Deterministic filenames for idempotency
- Includes SHA-256 checksum

**Filename Format**:

```
gdpr-export-{identityIdShort}-{timestamp}.zip
Example: gdpr-export-abc123-20260103T120000Z.zip
```

---

### 3. GdprExportStorage (Interface)

**Purpose**: Abstract interface for GDPR export file storage.

**Location**: `src/modules/gdpr/gdpr-export-storage.interface.ts`

**Interface**:

```typescript
interface GdprExportStorage {
  store(buffer: Buffer, metadata: GdprExportStorageMetadata): Promise<GdprExportStorageResult>;
  retrieve(storageKey: string): Promise<GdprExportRetrievedFile | null>;
  delete(storageKey: string): Promise<boolean>;
  exists(storageKey: string): Promise<boolean>;
}
```

**Injection Token**: `GDPR_EXPORT_STORAGE`

---

### 4. GdprLocalStorageAdapter

**Purpose**: Development-only filesystem storage implementation.

**Location**: `src/modules/gdpr/gdpr-local-storage.adapter.ts`

**Storage Structure**:

```
./storage/gdpr-exports/
  └── {identityId}/
      ├── gdpr-export-xxx.zip
      └── gdpr-export-xxx.zip.meta.json
```

**⚠️ Development Only**: This adapter stores files on the local filesystem.
Production should use S3-compatible storage.

---

### 5. GdprExportPipelineService

**Purpose**: Orchestrates the complete export pipeline.

**Location**: `src/modules/gdpr/gdpr-export-pipeline.service.ts`

**Pipeline Stages**:

| Stage       | Input              | Output          | Audit Action     |
| ----------- | ------------------ | --------------- | ---------------- |
| 1. Render   | GdprExportDocument | HTML string     | EXPORT_RENDERED  |
| 2. Package  | HTML string        | ZIP buffer      | EXPORT_PACKAGED  |
| 3. Store    | ZIP buffer         | Storage key     | EXPORT_STORED    |
| 4. Complete | All metadata       | Updated request | EXPORT_COMPLETED |

**Failure Handling**:

- On any failure: cleanup stored files, mark request FAILED, emit EXPORT_FAILED audit

---

## Audit Actions (Phase 4)

| Action             | Description                  |
| ------------------ | ---------------------------- |
| `EXPORT_RENDERED`  | HTML rendering completed     |
| `EXPORT_PACKAGED`  | ZIP archive created          |
| `EXPORT_STORED`    | File stored successfully     |
| `EXPORT_COMPLETED` | Request marked complete      |
| `EXPORT_FAILED`    | Pipeline failed (with error) |

---

## Export Metadata

When the export completes, metadata is persisted in `Request.dataPayload`:

```typescript
interface ExportMetadata {
  storageKey: string; // Key to retrieve the file
  filename: string; // Original filename
  fileSize: number; // File size in bytes
  checksum?: string; // SHA-256 checksum
  generatedAt: string; // ISO timestamp
  expiresAt: string; // When export expires
  schemaVersion: string; // Document schema version
  language: string; // Export language
}
```

---

## Usage Example

```typescript
import { GdprExportPipelineService } from './gdpr';

@Injectable()
export class ExportProcessor {
  constructor(
    private readonly pipeline: GdprExportPipelineService,
    private readonly documentBuilder: GdprDocumentBuilderService,
  ) {}

  async processExport(requestId: string, identityId: string): Promise<void> {
    // Phase 3.5: Build document
    const document = await this.documentBuilder.build(identityId, collectedData);

    // Phase 4: Execute pipeline
    const result = await this.pipeline.execute(document, {
      requestId,
      identityId,
      expirationDays: 7,
    });

    if (result.success) {
      console.log(`Export ready: ${result.storageKey}`);
    } else {
      console.error(`Export failed: ${result.error}`);
    }
  }
}
```

---

## Configuration

### Environment Variables

| Variable                      | Description             | Default                  |
| ----------------------------- | ----------------------- | ------------------------ |
| `GDPR_EXPORT_STORAGE_PATH`    | Local storage base path | `./storage/gdpr-exports` |
| `GDPR_EXPORT_EXPIRATION_DAYS` | Export expiration       | `7`                      |

### Module Registration

The storage adapter is registered via DI token:

```typescript
@Module({
  providers: [
    {
      provide: GDPR_EXPORT_STORAGE,
      useClass: GdprLocalStorageAdapter,  // Development
      // useClass: GdprS3StorageAdapter,  // Production
    },
  ],
})
```

---

## Storage Provider Swap (Production)

To switch to S3-compatible storage:

1. Create `GdprS3StorageAdapter` implementing `GdprExportStorage`
2. Update module registration:

```typescript
{
  provide: GDPR_EXPORT_STORAGE,
  useClass: process.env.NODE_ENV === 'production'
    ? GdprS3StorageAdapter
    : GdprLocalStorageAdapter,
}
```

3. Add S3 configuration:

```env
GDPR_S3_BUCKET=gdpr-exports
GDPR_S3_REGION=eu-west-1
GDPR_S3_PREFIX=exports/
```

---

## Security Considerations

### File Access

- Storage keys are UUIDs (not guessable)
- Files are organized by identity (isolation)
- Checksums validate file integrity
- Expiration enforces data minimization

### HTML Security

- All user content is escaped (XSS prevention)
- No external resources (CSP-safe)
- No inline event handlers
- Self-contained (no remote loading)

### Audit Trail

- Every pipeline step is logged
- Failures include error details
- Actor identification (SYSTEM for cron)
- Timestamps for compliance

---

## File Layout

```
src/modules/gdpr/
├── gdpr-html-renderer.service.ts     # HTML rendering
├── gdpr-export-packager.service.ts   # ZIP packaging
├── gdpr-export-storage.interface.ts  # Storage abstraction
├── gdpr-local-storage.adapter.ts     # Dev filesystem storage
├── gdpr-export-pipeline.service.ts   # Pipeline orchestrator
└── index.ts                          # Updated exports
```

---

## Dependencies

- `archiver`: ZIP archive creation
- `@types/archiver`: TypeScript types
- Node.js `crypto`: SHA-256 checksums
- Node.js `stream`: Streaming support

---

## Testing

### Unit Tests

```typescript
describe('GdprHtmlRenderer', () => {
  it('renders document to valid HTML', () => {
    const html = renderer.render(testDocument);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(testDocument.metadata.email);
  });

  it('escapes HTML in user content', () => {
    const html = renderer.render(documentWithXss);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('GdprExportPackager', () => {
  it('creates valid ZIP archive', async () => {
    const result = await packager.package('<html></html>', options);
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.filename).toMatch(/\.zip$/);
  });
});

describe('GdprExportPipelineService', () => {
  it('executes complete pipeline', async () => {
    const result = await pipeline.execute(document, options);
    expect(result.success).toBe(true);
    expect(result.storageKey).toBeDefined();
  });

  it('cleans up on failure', async () => {
    storage.store.mockRejectedValue(new Error('Storage error'));
    const result = await pipeline.execute(document, options);
    expect(result.success).toBe(false);
    expect(storage.delete).toHaveBeenCalled();
  });
});
```

---

## Phase 4 Boundaries

### ✅ Phase 4 DOES

- Render semantic documents to HTML
- Package HTML into ZIP archives
- Store files securely
- Persist export metadata
- Mark requests as COMPLETED
- Emit audit logs
- Handle failures gracefully

### ❌ Phase 4 does NOT

- Collect data (Phase 3)
- Build semantic documents (Phase 3.5)
- Expose download endpoints (Phase 5)
- Send notification emails (Phase 5)
- Schedule cron jobs
- Handle authentication
- Modify request lifecycle

---

## Next Steps (Phase 5)

Phase 5 will implement:

1. Download endpoint (`GET /gdpr/exports/:requestId/download`)
2. Download token generation
3. Notification email with download link
4. Expiration enforcement
5. Rate limiting for downloads

---

## References

- [GDPR Data Collection (Phase 3)](./GDPR_DATA_COLLECTION.md)
- [GDPR Export Rendering (Phase 3.5)](./GDPR_EXPORT_RENDERING.md)
- [Create Tables Guideline](./create_tables_guideline.md)
- [agents.md](../agents.md) - GDPR implementation guidelines

