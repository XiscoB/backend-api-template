import { RequestStatus, RequestType } from '@prisma/client';

/**
 * DTO for GDPR export request response.
 *
 * Minimal response for request initiation.
 * Product-specific extensions can add more fields as needed.
 */
export class GdprExportRequestDto {
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
  }): GdprExportRequestDto {
    const dto = new GdprExportRequestDto();
    dto.id = request.id;
    dto.requestType = request.requestType;
    dto.status = request.status;
    dto.createdAt = request.createdAt;
    return dto;
  }
}
