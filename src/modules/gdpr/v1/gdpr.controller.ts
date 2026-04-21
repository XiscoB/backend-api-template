import {
  Controller,
  Post,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  NotFoundException,
  ForbiddenException,
  GoneException,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AllowPendingRecovery } from '../../../common/decorators/allow-pending-recovery.decorator';
import { AuthenticatedUser } from '../../../common/auth/auth.types';
import { GdprExportService } from '../gdpr-export.service';
import { GdprDeletionLifecycleService } from '../gdpr-deletion-lifecycle.service';
import { GdprSuspensionService } from '../gdpr-suspension.service';
import { GdprExportDeliveryService } from '../gdpr-export-delivery.service';
import {
  GdprExportRequestDto,
  GdprDeleteRequestDto,
  GdprSuspendRequestDto,
  GdprRecoveryResponseDto,
  GdprExportDownloadResponseDto,
  GdprExportStatusResponseDto,
} from './dto';

/**
 * GDPR Controller (v1)
 *
 * Handles GDPR data export, deletion, suspension, and resume request initiation.
 * All routes require authentication (global JWT guard).
 *
 * v1 Scope:
 * - POST /export: Request a GDPR data export (creates request, background processes)
 * - GET /exports/:requestId: Get export status
 * - GET /exports/:requestId/download: Download a completed export
 * - POST /delete: Request a GDPR data deletion (creates request, background processes)
 * - POST /suspend: Request a GDPR account suspension (creates request, background processes)
 * - POST /recover: Recover a suspended account (synchronous operation)
 *
 * Access: USER, ENTITY roles required
 */
@Controller('v1/gdpr')
export class GdprController {
  constructor(
    private readonly gdprExportService: GdprExportService,
    private readonly gdprDeletionLifecycleService: GdprDeletionLifecycleService,
    private readonly gdprSuspensionService: GdprSuspensionService,
    private readonly gdprExportDeliveryService: GdprExportDeliveryService,
  ) {}

  /**
   * Request a GDPR data export.
   *
   * Creates a pending request that will be processed by a background worker.
   * The actual export is handled asynchronously - this endpoint only initiates.
   *
   * How to extend (product-specific):
   * - Add GET /export/:id for status checking
   * - Add download mechanism (email, S3 presigned URL, etc.)
   *
   * @example POST /api/v1/gdpr/export
   *
   * @returns The created request ID and status
   * @throws 409 Conflict if user already has a pending export request
   */
  @Post('export')
  @HttpCode(HttpStatus.ACCEPTED) // 202 - Request accepted for processing
  async requestExport(@CurrentUser() user: AuthenticatedUser): Promise<GdprExportRequestDto> {
    const request = await this.gdprExportService.requestExport(user.id);
    return GdprExportRequestDto.fromEntity(request);
  }

  /**
   * Request a GDPR data deletion (Right to Erasure).
   *
   * Creates a pending request that will be processed by a background worker.
   * The actual deletion is handled asynchronously - this endpoint only initiates.
   *
   * Deletion behavior is registry-driven:
   * - DELETE strategy: Hard delete all rows matching userField = userId
   * - ANONYMIZE strategy: Replace fields + userField with anonymized values
   *
   * Important:
   * - User record itself is NOT deleted (preserved for referential integrity)
   * - Deletion is permanent - no undo/restore functionality
   * - One anonymized UID is generated per deletion and reused across all tables
   *
   * @example POST /api/v1/gdpr/delete
   *
   * @returns The created request ID and status
   * @throws 409 Conflict if user already has a pending deletion request
   */
  @Post('delete')
  @HttpCode(HttpStatus.ACCEPTED) // 202 - Request accepted for processing
  async requestDelete(@CurrentUser() user: AuthenticatedUser): Promise<GdprDeleteRequestDto> {
    const result = await this.gdprDeletionLifecycleService.requestDeletion(user.id, user.email);
    return GdprDeleteRequestDto.fromLifecycleResult(result);
  }

  /**
   * Request a GDPR account suspension (Right to Restriction of Processing).
   *
   * Creates a pending request that will be processed by a background worker.
   * The actual suspension is handled asynchronously - this endpoint only initiates.
   *
   * Suspension behavior:
   * - Temporarily anonymizes personal data across all registered tables
   * - Backs up original data for potential recovery
   * - Auto-escalates to deletion after grace period (default 30 days)
   * - Reversible via POST /resume endpoint
   *
   * Important:
   * - Only one active suspension per user is allowed
   * - No data is deleted during suspension
   * - Suspension does NOT affect authentication (external responsibility)
   *
   * @example POST /api/v1/gdpr/suspend
   *
   * @returns The created request ID and status
   * @throws 409 Conflict if user already has a pending suspension or active suspension
   */
  @Post('suspend')
  @HttpCode(HttpStatus.ACCEPTED) // 202 - Request accepted for processing
  async requestSuspend(@CurrentUser() user: AuthenticatedUser): Promise<GdprSuspendRequestDto> {
    const request = await this.gdprSuspensionService.requestSuspension(user.id);
    return GdprSuspendRequestDto.fromEntity(request);
  }

  /**
   * Recover a suspended account.
   *
   * Restores all backed-up data and reactivates the account.
   * This is a synchronous operation - data is restored immediately.
   *
   * Recovery is STRICT and DETERMINISTIC:
   * ALL preconditions must be met for recovery to proceed:
   * - Backup exists for the suspension
   * - Backup has not been used (consumed)
   * - Current time < suspendedUntil deadline
   * - Account is in SUSPENDED state
   * - Suspension has not expired
   *
   * Recovery behavior:
   * - Restores original personal data from backups
   * - Marks backups as used (consumed)
   * - Transitions lifecycle state to RECOVERED
   * - Emits hooks for external systems (auth re-enablement, etc.)
   *
   * Important:
   * - Once suspension has expired, recovery is IMPOSSIBLE
   * - This is the preferred endpoint (resume is deprecated)
   *
   * @example POST /api/v1/gdpr/recover
   *
   * @returns Summary of the recovery operation
   * @throws 404 Not Found if no active suspension exists
   * @throws 403 Forbidden if recovery preconditions not met
   */
  @Post('recover')
  @HttpCode(HttpStatus.OK)
  @AllowPendingRecovery()
  async recoverAccount(@CurrentUser() user: AuthenticatedUser): Promise<GdprRecoveryResponseDto> {
    const result = await this.gdprSuspensionService.recoverAccount(user.id);
    return GdprRecoveryResponseDto.fromResult(result);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Phase 5: Export Delivery & Access Control
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get the status of a GDPR export request.
   *
   * Returns the current status and availability of an export.
   * Users can only check the status of their own exports.
   *
   * @example GET /api/v1/gdpr/exports/:requestId
   *
   * @param requestId - The export request ID
   * @returns Export status details
   * @throws 403 Forbidden if user doesn't own the request
   * @throws 404 Not Found if request doesn't exist
   */
  @Get('exports/:requestId')
  @HttpCode(HttpStatus.OK)
  async getExportStatus(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GdprExportStatusResponseDto> {
    return await this.gdprExportDeliveryService.getExportStatus(requestId, user.id);
  }

  /**
   * Download a completed GDPR export.
   *
   * Returns a short-lived presigned URL for downloading the export.
   * The URL expires quickly (default 5 minutes) for security.
   *
   * Security:
   * - Users can only download their own exports
   * - Expired exports return 410 Gone
   * - All download attempts are audited
   *
   * @example GET /api/v1/gdpr/exports/:requestId/download
   *
   * @param requestId - The export request ID
   * @returns Presigned download URL and metadata
   * @throws 403 Forbidden if user doesn't own the request
   * @throws 404 Not Found if request doesn't exist or isn't completed
   * @throws 410 Gone if export has expired
   */
  @Get('exports/:requestId/download')
  @HttpCode(HttpStatus.OK)
  async downloadExport(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GdprExportDownloadResponseDto> {
    const result = await this.gdprExportDeliveryService.authorizeDownload(requestId, user.id);

    if (!result.authorized) {
      switch (result.errorCode) {
        case 'FORBIDDEN':
          throw new ForbiddenException(result.errorMessage);
        case 'EXPIRED':
          throw new GoneException(result.errorMessage);
        case 'NOT_FOUND':
        case 'NOT_READY':
        default:
          throw new NotFoundException(result.errorMessage);
      }
    }

    return {
      downloadUrl: result.downloadUrl!,
      expiresAt: result.expiresAt!,
      filename: result.filename!,
      fileSize: result.fileSize,
    };
  }
}
