import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import * as crypto from 'crypto';
import {
  GdprExportStorage,
  GdprExportStorageMetadata,
  GdprExportStorageResult,
  GdprExportRetrievedFile,
} from './gdpr-export-storage.interface';

/**
 * AWS SDK v3 error shape.
 * SDK errors have a `name` property and `$metadata` with HTTP status.
 */
interface AwsSdkError {
  name: string;
  message?: string;
  $metadata?: {
    httpStatusCode?: number;
  };
}

/**
 * Type guard for AWS SDK errors.
 */
function isAwsSdkError(error: unknown): error is AwsSdkError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as AwsSdkError).name === 'string'
  );
}

/**
 * AWS S3 Storage Adapter for GDPR Exports (Phase 5)
 *
 * Production-ready storage implementation using AWS S3.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Private by default**: All objects stored with private ACL.
 *    Access only via presigned URLs or IAM credentials.
 *
 * 2. **Identity isolation**: Objects stored under identity-prefixed keys.
 *    Example: exports/{identityId}/{filename}
 *
 * 3. **Metadata-rich**: S3 object metadata includes request ID, expiry, etc.
 *    Enables lifecycle policies and auditing.
 *
 * 4. **No public URLs**: All access via short-lived presigned URLs.
 *    URLs are never stored, only generated on demand.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Required environment variables:
 * - AWS_REGION: AWS region (e.g., eu-west-1)
 * - AWS_S3_BUCKET: S3 bucket name
 * - AWS_ACCESS_KEY_ID: AWS access key
 * - AWS_SECRET_ACCESS_KEY: AWS secret key
 *
 * Optional:
 * - GDPR_PRESIGNED_URL_TTL_SECONDS: Presigned URL TTL (default: 300)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURITY CONSIDERATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - Storage keys are UUIDs (not guessable)
 * - Presigned URLs expire quickly (5 minutes default)
 * - No public bucket policies
 * - Server-side encryption (SSE-S3) recommended
 * - VPC endpoint access recommended for production
 */

/**
 * Result of generating a presigned URL.
 */
export interface PresignedUrlResult {
  /** The presigned URL for download */
  url: string;

  /** When the URL expires */
  expiresAt: Date;

  /** TTL in seconds */
  ttlSeconds: number;
}

@Injectable()
export class GdprS3StorageAdapter implements GdprExportStorage, OnModuleInit {
  private readonly logger = new Logger(GdprS3StorageAdapter.name);
  private s3Client: S3Client | null = null;
  private bucket: string = '';
  private region: string = '';
  private presignedUrlTtl: number = 300; // 5 minutes default
  private isConfigured: boolean = false;

  /** S3 key prefix for GDPR exports */
  private readonly keyPrefix = 'gdpr-exports';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initialize S3 client on module startup.
   */
  onModuleInit(): void {
    this.initializeS3Client();
  }

  /**
   * Initialize the S3 client from environment variables.
   */
  private initializeS3Client(): void {
    this.region = this.configService.get<string>('AWS_REGION', '');
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET', '');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY', '');
    this.presignedUrlTtl = this.configService.get<number>('GDPR_PRESIGNED_URL_TTL_SECONDS', 300);

    // Check if S3 is configured
    if (!this.region || !this.bucket || !accessKeyId || !secretAccessKey) {
      this.logger.warn(
        '[S3Storage] AWS S3 not fully configured. GDPR exports will use local storage fallback.',
      );
      this.isConfigured = false;
      return;
    }

    try {
      this.s3Client = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      this.isConfigured = true;
      this.logger.log(
        `[S3Storage] Initialized with bucket: ${this.bucket}, region: ${this.region}`,
      );
    } catch (error: unknown) {
      this.logger.error(`[S3Storage] Failed to initialize: ${String(error)}`);
      this.isConfigured = false;
    }
  }

  /**
   * Check if S3 is properly configured.
   */
  isS3Configured(): boolean {
    return this.isConfigured && this.s3Client !== null;
  }

  /**
   * Store an export file in S3.
   */
  async store(
    buffer: Buffer,
    metadata: GdprExportStorageMetadata,
  ): Promise<GdprExportStorageResult> {
    this.ensureConfigured();

    const storageKey = this.generateStorageKey(metadata.identityId, metadata.filename);
    const checksum = this.calculateChecksum(buffer);

    this.logger.debug(`[S3Storage] Storing file: ${storageKey} (${buffer.length} bytes)`);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: metadata.mimeType,
        ContentLength: buffer.length,
        // Store metadata for lifecycle policies and auditing
        Metadata: {
          'identity-id': metadata.identityId,
          'request-id': metadata.requestId,
          'original-filename': metadata.filename,
          'generated-at': metadata.generatedAt.toISOString(),
          'expires-at': metadata.expiresAt.toISOString(),
          checksum: checksum,
        },
        // Use server-side encryption
        ServerSideEncryption: 'AES256',
      });

      await this.s3Client!.send(command);

      this.logger.log(`[S3Storage] Stored: ${storageKey}`);

      return {
        storageKey,
        size: buffer.length,
        checksum,
        storedAt: new Date(),
        storageProvider: 'S3',
      };
    } catch (error: unknown) {
      this.logger.error(`[S3Storage] Failed to store: ${String(error)}`);
      throw new Error(`Failed to store GDPR export: ${String(error)}`);
    }
  }

  /**
   * Retrieve an export file from S3.
   */
  async retrieve(storageKey: string): Promise<GdprExportRetrievedFile> {
    this.ensureConfigured();

    this.logger.debug(`[S3Storage] Retrieving file: ${storageKey}`);

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });

      const response = await this.s3Client!.send(command);

      if (!response.Body) {
        throw new Error('Empty response body');
      }

      // Extract metadata from S3 object
      const s3Metadata = response.Metadata ?? {};
      const filename = s3Metadata['original-filename'] ?? 'gdpr-export.zip';

      return {
        stream: response.Body as Readable,
        mimeType: response.ContentType ?? 'application/zip',
        filename,
        size: response.ContentLength ?? 0,
      };
    } catch (error: unknown) {
      if (
        isAwsSdkError(error) &&
        (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)
      ) {
        throw new Error(`File not found: ${storageKey}`);
      }
      this.logger.error(`[S3Storage] Failed to retrieve: ${String(error)}`);
      throw new Error(`Failed to retrieve GDPR export: ${String(error)}`);
    }
  }

  /**
   * Delete an export file from S3.
   */
  async delete(storageKey: string): Promise<boolean> {
    this.ensureConfigured();

    this.logger.debug(`[S3Storage] Deleting file: ${storageKey}`);

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });

      await this.s3Client!.send(command);

      this.logger.log(`[S3Storage] Deleted: ${storageKey}`);
      return true;
    } catch (error: unknown) {
      if (
        isAwsSdkError(error) &&
        (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)
      ) {
        this.logger.warn(`[S3Storage] File not found for deletion: ${storageKey}`);
        return false;
      }
      this.logger.error(`[S3Storage] Failed to delete: ${String(error)}`);
      throw new Error(`Failed to delete GDPR export: ${String(error)}`);
    }
  }

  /**
   * Check if an export file exists in S3.
   */
  async exists(storageKey: string): Promise<boolean> {
    this.ensureConfigured();

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });

      await this.s3Client!.send(command);
      return true;
    } catch (error: unknown) {
      if (
        isAwsSdkError(error) &&
        (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404)
      ) {
        return false;
      }
      this.logger.error(`[S3Storage] Failed to check existence: ${String(error)}`);
      throw new Error(`Failed to check GDPR export existence: ${String(error)}`);
    }
  }

  /**
   * Generate a presigned URL for downloading an export.
   *
   * CRITICAL: Presigned URLs are:
   * - Generated on demand
   * - Never stored in database
   * - Never logged
   * - Short-lived (default 5 minutes)
   *
   * @param storageKey - The S3 object key
   * @param ttlSeconds - Optional TTL override (default from env)
   * @returns Presigned URL result
   */
  async generatePresignedUrl(storageKey: string, ttlSeconds?: number): Promise<PresignedUrlResult> {
    this.ensureConfigured();

    const effectiveTtl = ttlSeconds ?? this.presignedUrlTtl;

    // First verify the object exists
    const fileExists = await this.exists(storageKey);
    if (!fileExists) {
      throw new Error(`File not found: ${storageKey}`);
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      });

      const url = await getSignedUrl(this.s3Client!, command, {
        expiresIn: effectiveTtl,
      });

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + effectiveTtl);

      this.logger.debug(
        `[S3Storage] Generated presigned URL for: ${storageKey} (expires: ${expiresAt.toISOString()})`,
      );

      return {
        url,
        expiresAt,
        ttlSeconds: effectiveTtl,
      };
    } catch (error: unknown) {
      this.logger.error(`[S3Storage] Failed to generate presigned URL: ${String(error)}`);
      throw new Error(`Failed to generate download URL: ${String(error)}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Ensure S3 is configured before operations.
   */
  private ensureConfigured(): void {
    if (!this.isS3Configured()) {
      throw new Error(
        'AWS S3 is not configured. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY.',
      );
    }
  }

  /**
   * Generate a storage key for the export.
   *
   * Format: gdpr-exports/{identityId}/{uuid}-{filename}
   */
  private generateStorageKey(identityId: string, filename: string): string {
    const uuid = crypto.randomUUID();
    // Sanitize filename for S3 key
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${this.keyPrefix}/${identityId}/${uuid}-${safeFilename}`;
  }

  /**
   * Calculate SHA-256 checksum.
   */
  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }
}
