import { RequestStatus, RequestType } from '@prisma/client';

/**
 * DTO for GDPR suspend request response.
 *
 * Minimal response for request initiation.
 * Same shape as export/delete DTOs for consistency.
 */
export class GdprSuspendRequestDto {
  /** Request unique identifier */
  id!: string;

  /** Request type */
  requestType!: RequestType;

  /** Current status of the request */
  status!: RequestStatus;

  /** When the request was created */
  createdAt!: Date;

  /**
   * Create a DTO from a Prisma Request.
   */
  static fromEntity(request: {
    id: string;
    requestType: RequestType;
    status: RequestStatus;
    createdAt: Date;
  }): GdprSuspendRequestDto {
    const dto = new GdprSuspendRequestDto();
    dto.id = request.id;
    dto.requestType = request.requestType;
    dto.status = request.status;
    dto.createdAt = request.createdAt;
    return dto;
  }
}
