import { RequestStatus, RequestType } from '@prisma/client';
import { DeletionLifecycleResult } from '../../gdpr-deletion-lifecycle.service';

/**
 * DTO for GDPR delete request response.
 *
 * Supports both:
 * - Legacy entity mapping (from Request entity)
 * - Lifecycle result mapping (from DeletionLifecycleResult)
 */
export class GdprDeleteRequestDto {
  /** Request unique identifier (from entity) or identity ID (from lifecycle) */
  id!: string;

  /** Request type */
  requestType!: RequestType;

  /** Current status of the request */
  status!: RequestStatus | 'PENDING_DELETION' | 'CANCELLED' | 'FINALIZED';

  /** When the request was created or deletion was initiated */
  createdAt!: Date;

  /** When final deletion is scheduled (lifecycle only) */
  scheduledFinalDeletionAt?: string;

  /** Human-readable message (lifecycle only) */
  message?: string;

  /**
   * Create a DTO from a Prisma Request entity.
   * Used by legacy deletion service.
   */
  static fromEntity(request: {
    id: string;
    requestType: RequestType;
    status: RequestStatus;
    createdAt: Date;
  }): GdprDeleteRequestDto {
    const dto = new GdprDeleteRequestDto();
    dto.id = request.id;
    dto.requestType = request.requestType;
    dto.status = request.status;
    dto.createdAt = request.createdAt;
    return dto;
  }

  /**
   * Create a DTO from a DeletionLifecycleResult.
   * Used by the lifecycle-aware deletion flow.
   */
  static fromLifecycleResult(result: DeletionLifecycleResult): GdprDeleteRequestDto {
    const dto = new GdprDeleteRequestDto();
    dto.id = result.identityId;
    dto.requestType = RequestType.GDPR_DELETE;
    dto.status = result.status;
    dto.createdAt = result.deletedAt ?? new Date();
    dto.scheduledFinalDeletionAt = result.scheduledFinalDeletionAt?.toISOString();
    dto.message = result.message;
    return dto;
  }
}
