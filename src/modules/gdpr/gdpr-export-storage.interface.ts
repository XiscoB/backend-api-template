import { Readable } from 'stream';

/**
 * GDPR Export Storage Abstraction (Phase 4)
 *
 * Defines the interface for storing GDPR export files.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Provider-agnostic**: Works with S3, GCS, Azure Blob, local filesystem.
 *    Implementation is swappable via dependency injection.
 *
 * 2. **Private storage**: Files are stored privately. No public URLs.
 *    Phase 5 will add secure download mechanisms.
 *
 * 3. **Metadata-rich**: Each stored file has associated metadata.
 *    Enables expiration, cleanup, and auditing.
 *
 * 4. **No Prisma models**: Storage layer knows nothing about database.
 *    Metadata persistence happens in the orchestrator.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPLEMENTATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This file defines the interface. Implementations:
 * - GdprLocalStorageAdapter: Local filesystem (development)
 * - GdprS3StorageAdapter: S3-compatible storage (production) - future
 *
 * Storage provider is configured via environment variables.
 */

/**
 * Metadata for storing an export file.
 */
export interface GdprExportStorageMetadata {
  /** Identity ID for whom the export was created */
  identityId: string;

  /** GDPR request ID associated with this export */
  requestId: string;

  /** Original filename (for display purposes) */
  filename: string;

  /** MIME type of the file */
  mimeType: string;

  /** When the export was generated */
  generatedAt: Date;

  /** When the export expires (for cleanup) */
  expiresAt: Date;
}

/**
 * Result of storing an export file.
 */
export interface GdprExportStorageResult {
  /** Unique storage key (for retrieval) */
  storageKey: string;

  /** Size of stored file in bytes */
  size: number;

  /** SHA-256 checksum of stored file (optional) */
  checksum?: string;

  /** When the file was stored */
  storedAt: Date;

  /** Storage provider type ("S3" or "LOCAL") */
  storageProvider: string;
}

/**
 * Retrieved export file.
 */
export interface GdprExportRetrievedFile {
  /** File content as stream */
  stream: Readable;

  /** MIME type of the file */
  mimeType: string;

  /** Original filename */
  filename: string;

  /** Size in bytes */
  size: number;
}

/**
 * Abstract storage interface for GDPR exports.
 *
 * All storage implementations must implement this interface.
 *
 * Methods:
 * - store(): Save export file to storage
 * - retrieve(): Get export file from storage
 * - delete(): Remove export file from storage
 * - exists(): Check if export file exists
 */
export interface GdprExportStorage {
  /**
   * Store an export file.
   *
   * @param buffer - File content as Buffer
   * @param metadata - Storage metadata
   * @returns Storage result with key and size
   */
  store(buffer: Buffer, metadata: GdprExportStorageMetadata): Promise<GdprExportStorageResult>;

  /**
   * Retrieve an export file.
   *
   * @param storageKey - Key returned from store()
   * @returns Retrieved file with stream
   * @throws Error if file not found
   */
  retrieve(storageKey: string): Promise<GdprExportRetrievedFile>;

  /**
   * Delete an export file.
   *
   * @param storageKey - Key returned from store()
   * @returns True if deleted, false if not found
   */
  delete(storageKey: string): Promise<boolean>;

  /**
   * Check if an export file exists.
   *
   * @param storageKey - Key returned from store()
   * @returns True if exists, false otherwise
   */
  exists(storageKey: string): Promise<boolean>;
}

/**
 * Storage provider token for dependency injection.
 *
 * Usage:
 * ```typescript
 * @Inject(GDPR_EXPORT_STORAGE)
 * private readonly storage: GdprExportStorage
 * ```
 */
export const GDPR_EXPORT_STORAGE = Symbol('GDPR_EXPORT_STORAGE');
