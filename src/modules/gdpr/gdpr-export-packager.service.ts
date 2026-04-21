import { Injectable, Logger } from '@nestjs/common';
import archiver from 'archiver';
import { PassThrough } from 'stream';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Branding assets configuration.
 *
 * Keep in sync with gdpr-document-builder.service.ts
 */
const BRANDING = {
  companyName: process.env.COMPANY_NAME ?? 'Your Company',
  logoPath: 'assets/branding/logo.png',
};

/**
 * GDPR Export ZIP Packager (Phase 4)
 *
 * Creates ZIP archives containing GDPR export files.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY ZIP?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ZIP format is used because:
 * 1. **Universal support**: Every OS can open ZIP files natively
 * 2. **Compression**: Reduces file size for storage and transfer
 * 3. **Extensibility**: Can add more files later (JSON, receipts, etc.)
 * 4. **Integrity**: ZIP includes CRC checksums for each file
 * 5. **Single download**: User gets one file, not multiple
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DESIGN PRINCIPLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **Streaming**: Uses streams to avoid loading entire file in memory.
 *    Important for large exports with many notifications.
 *
 * 2. **No disk I/O**: Archive is created in memory and streamed.
 *    No temporary files are created on disk.
 *
 * 3. **Deterministic filenames**: Filenames are predictable and safe.
 *    No user PII in filenames (except internal identity ID).
 *
 * 4. **Separation of concerns**: Packager knows NOTHING about:
 *    - HTML structure (receives string)
 *    - Storage location (returns Buffer)
 *    - Database (pure transformation)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FILE NAMING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Filename format: gdpr-export-{identityId}-{timestamp}.zip
 *
 * Rules:
 * - Deterministic (same inputs → same filename)
 * - Filesystem-safe (no special characters)
 * - No PII beyond internal identity ID
 * - ISO 8601 timestamp (colons replaced with hyphens)
 */

/**
 * Result of packaging operation.
 */
export interface PackagedExport {
  /** ZIP file as Buffer */
  buffer: Buffer;

  /** Suggested filename for the ZIP */
  filename: string;

  /** Size in bytes */
  size: number;

  /** Internal HTML filename (inside ZIP) */
  htmlFilename: string;
}

/**
 * Options for packaging.
 */
export interface PackageOptions {
  /** Identity ID (for filename) */
  identityId: string;

  /** Generation timestamp (for filename) */
  generatedAt: Date;

  /** Compression level (0-9, default 6) */
  compressionLevel?: number;
}

@Injectable()
export class GdprExportPackager {
  private readonly logger = new Logger(GdprExportPackager.name);

  /** Default compression level (balanced speed/size) */
  private readonly defaultCompressionLevel = 6;

  /**
   * Package rendered HTML into a ZIP archive.
   *
   * @param htmlContent - Rendered HTML string from HTML renderer
   * @param options - Packaging options (identity, timestamp)
   * @returns Packaged export with buffer and metadata
   */
  async package(htmlContent: string, options: PackageOptions): Promise<PackagedExport> {
    this.logger.log(`[Packager] Packaging export for identity: ${options.identityId}`);

    const startTime = Date.now();

    // Generate filenames
    const htmlFilename = this.generateHtmlFilename(options);
    const zipFilename = this.generateZipFilename(options);

    // Create ZIP archive in memory
    const buffer = await this.createZipBuffer(htmlContent, htmlFilename, options);

    const duration = Date.now() - startTime;
    this.logger.log(
      `[Packager] Export packaged: ${zipFilename} (${buffer.length} bytes, ${duration}ms)`,
    );

    return {
      buffer,
      filename: zipFilename,
      size: buffer.length,
      htmlFilename,
    };
  }

  /**
   * Create ZIP archive as Buffer.
   *
   * Uses streaming to minimize memory usage:
   * 1. Create archiver instance
   * 2. Pipe to PassThrough stream
   * 3. Collect chunks into Buffer
   */
  private async createZipBuffer(
    htmlContent: string,
    htmlFilename: string,
    options: PackageOptions,
  ): Promise<Buffer> {
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const passthrough = new PassThrough();

      // Collect chunks
      passthrough.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      passthrough.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      passthrough.on('error', (err) => {
        reject(err);
      });

      // Create archiver
      const archive = archiver('zip', {
        zlib: {
          level: options.compressionLevel ?? this.defaultCompressionLevel,
        },
      });

      // Handle archiver errors
      archive.on('error', (err: Error) => {
        this.logger.error(`[Packager] Archive error: ${err.message}`);
        reject(err);
      });

      archive.on('warning', (warn: Error) => {
        this.logger.warn(`[Packager] Archive warning: ${warn.message}`);
      });

      // Pipe archive to passthrough stream
      archive.pipe(passthrough);

      // Add HTML file to archive (use Buffer directly, not stream)
      const htmlBuffer = Buffer.from(htmlContent, 'utf-8');
      archive.append(htmlBuffer, { name: htmlFilename });

      // Add logo file if it exists
      const logoPath = path.join(process.cwd(), BRANDING.logoPath);
      this.logger.log(`[Packager] Checking for logo at: ${logoPath}`);

      if (fs.existsSync(logoPath)) {
        try {
          const logoBuffer = fs.readFileSync(logoPath);
          this.logger.log(
            `[Packager] Logo file found (${logoBuffer.length} bytes), adding to ZIP as: ${BRANDING.logoPath}`,
          );
          // Use Buffer directly instead of stream - archiver processes this synchronously
          archive.append(logoBuffer, { name: BRANDING.logoPath });
          this.logger.log(`[Packager] Logo appended to archive`);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`[Packager] Failed to include logo in ZIP: ${errMsg}`);
        }
      } else {
        this.logger.log(`[Packager] Logo file not found, skipping`);
      }

      // Finalize archive (all appends above are synchronous with Buffers)
      // Return value intentionally ignored - completion signaled via stream events
      void archive.finalize();
    });
  }

  /**
   * Generate deterministic HTML filename.
   *
   * Format: gdpr-export.html
   *
   * Simple name since it's inside a uniquely-named ZIP.
   */
  private generateHtmlFilename(_options: PackageOptions): string {
    return 'gdpr-export.html';
  }

  /**
   * Generate deterministic ZIP filename.
   *
   * Format: gdpr-export-{identityId}-{timestamp}.zip
   *
   * Timestamp format: YYYY-MM-DDTHH-MM-SS (ISO 8601 with colons replaced)
   */
  private generateZipFilename(options: PackageOptions): string {
    const timestamp = this.formatFilesafeTimestamp(options.generatedAt);
    const identityIdShort = this.truncateIdentityId(options.identityId);

    return `gdpr-export-${identityIdShort}-${timestamp}.zip`;
  }

  /**
   * Format timestamp for use in filenames.
   *
   * Replaces colons with hyphens (filesystem-safe).
   * Format: YYYY-MM-DDTHH-MM-SSZ
   */
  private formatFilesafeTimestamp(date: Date): string {
    // ISO format: 2024-01-15T10:30:00.000Z
    // Filesafe:   2024-01-15T10-30-00Z
    return date
      .toISOString()
      .replace(/:/g, '-') // Replace colons with hyphens
      .replace(/\.\d{3}Z$/, 'Z'); // Remove milliseconds
  }

  /**
   * Truncate identity ID for filename.
   *
   * Uses first 8 characters of UUID for brevity.
   * Still provides uniqueness in practice.
   */
  private truncateIdentityId(identityId: string): string {
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    // Take first segment (8 chars)
    // Intentionally using || because empty string from split() is not a valid segment
    return identityId.split('-')[0] || identityId.slice(0, 8);
  }
}
