/**
 * Response DTO for GDPR export download.
 *
 * Returns a short-lived presigned URL for downloading the export.
 * The URL expires quickly (default 5 minutes) for security.
 */
export class GdprExportDownloadResponseDto {
  /** Presigned URL for downloading the export */
  downloadUrl!: string;

  /** When the download URL expires */
  expiresAt!: Date;

  /** Original filename of the export */
  filename!: string;

  /** File size in bytes */
  fileSize?: number;
}

/**
 * Response DTO for GDPR export status.
 */
export class GdprExportStatusResponseDto {
  /** Request ID */
  requestId!: string;

  /** Current status of the export */
  status!: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

  /** When the request was created */
  createdAt!: Date;

  /** When processing completed */
  completedAt?: Date;

  /** When the export expires */
  expiresAt?: Date;

  /** Whether download is available */
  downloadAvailable!: boolean;

  /** Error message if failed */
  errorMessage?: string;
}
