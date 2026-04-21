import { Injectable } from '@nestjs/common';
import {
  Prisma,
  Request,
  GdprAuditLog,
  GdprAuditAction,
  RequestStatus,
  RequestType,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * GDPR Repository
 *
 * Handles database operations for GDPR-related entities.
 * Uses the generic Request table for async operations.
 * All Prisma operations for GDPR are encapsulated here.
 *
 * IMPORTANT: This repository operates on identityId, NOT externalUserId.
 * Identity resolution happens at the service layer.
 */
@Injectable()
export class GdprRepository {
  private static readonly DEFAULT_STALE_PROCESSING_MS = 5 * 60 * 1000;
  private static readonly MIN_STALE_PROCESSING_MS = 60 * 1000;
  private static readonly MAX_STALE_PROCESSING_MS = 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  private toBoundedStaleProcessingMs(staleProcessingMs: number | undefined): number {
    const requested = staleProcessingMs ?? GdprRepository.DEFAULT_STALE_PROCESSING_MS;
    return Math.min(
      GdprRepository.MAX_STALE_PROCESSING_MS,
      Math.max(GdprRepository.MIN_STALE_PROCESSING_MS, requested),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Request Operations (Generic Request Table)
  // ─────────────────────────────────────────────────────────────

  /**
   * Create a new request.
   */
  async createRequest(data: { identityId: string; requestType: RequestType }): Promise<Request> {
    return await this.prisma.request.create({
      data: {
        identityId: data.identityId,
        requestType: data.requestType,
        status: RequestStatus.PENDING,
      },
    });
  }

  /**
   * Find a request by ID.
   */
  async findRequestById(id: string): Promise<Request | null> {
    return await this.prisma.request.findUnique({
      where: { id },
    });
  }

  /**
   * Find pending requests by type (for cron processing).
   */
  async findPendingRequests(requestType: RequestType): Promise<Request[]> {
    return await this.prisma.request.findMany({
      where: {
        requestType,
        status: RequestStatus.PENDING,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Atomically claim pending requests for processing.
   *
   * Concurrency contract:
   * - Candidate selection and transition to PROCESSING happen in a single SQL statement.
   * - Uses FOR UPDATE SKIP LOCKED to ensure multiple workers never claim the same row.
   * - Reclaims stale PROCESSING rows after a bounded timeout for crash recovery.
   * - Deterministic ordering: fresh PENDING first, then stale PROCESSING; FIFO by createdAt + id.
   */
  async claimPendingRequestsForProcessing(
    requestType: RequestType,
    limit: number,
    staleProcessingMs?: number,
  ): Promise<Request[]> {
    if (limit <= 0) {
      return [];
    }

    const boundedStaleProcessingMs = this.toBoundedStaleProcessingMs(staleProcessingMs);

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH candidates AS (
        SELECT r.id
        FROM gdpr_requests r
        WHERE r.request_type = ${requestType}::"gdpr_request_type"
          AND (
            r.status = 'PENDING'::"gdpr_request_status"
            OR (
              r.status = 'PROCESSING'::"gdpr_request_status"
              AND r.updated_at < NOW() - (${boundedStaleProcessingMs} * INTERVAL '1 millisecond')
            )
          )
        ORDER BY
          CASE WHEN r.status = 'PENDING'::"gdpr_request_status" THEN 0 ELSE 1 END,
          r.created_at ASC,
          r.id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE gdpr_requests target
      SET status = 'PROCESSING'::"gdpr_request_status",
          error_message = NULL,
          processed_at = NULL,
          updated_at = NOW()
      FROM candidates
      WHERE target.id = candidates.id
      RETURNING target.id
    `);

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);

    return await this.prisma.request.findMany({
      where: { id: { in: ids } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * Atomically claim one request for a specific identity and request type.
   */
  async claimPendingRequestForIdentity(
    identityId: string,
    requestType: RequestType,
    staleProcessingMs?: number,
  ): Promise<Request | null> {
    const boundedStaleProcessingMs = this.toBoundedStaleProcessingMs(staleProcessingMs);

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH candidate AS (
        SELECT r.id
        FROM gdpr_requests r
        WHERE r.identity_id = ${identityId}::uuid
          AND r.request_type = ${requestType}::"gdpr_request_type"
          AND (
            r.status = 'PENDING'::"gdpr_request_status"
            OR (
              r.status = 'PROCESSING'::"gdpr_request_status"
              AND r.updated_at < NOW() - (${boundedStaleProcessingMs} * INTERVAL '1 millisecond')
            )
          )
        ORDER BY
          CASE WHEN r.status = 'PENDING'::"gdpr_request_status" THEN 0 ELSE 1 END,
          r.created_at ASC,
          r.id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE gdpr_requests target
      SET status = 'PROCESSING'::"gdpr_request_status",
          error_message = NULL,
          processed_at = NULL,
          updated_at = NOW()
      FROM candidate
      WHERE target.id = candidate.id
      RETURNING target.id
    `);

    if (rows.length === 0) {
      return null;
    }

    return await this.findRequestById(rows[0].id);
  }

  /**
   * Update request status to PROCESSING.
   */
  async markRequestProcessing(id: string): Promise<Request | null> {
    const updated = await this.prisma.request.updateMany({
      where: {
        id,
        status: RequestStatus.PENDING,
      },
      data: {
        status: RequestStatus.PROCESSING,
      },
    });

    if (updated.count === 0) {
      return null;
    }

    return await this.findRequestById(id);
  }

  /**
   * Mark request as completed.
   */
  async markRequestCompleted(
    id: string,
    data?: {
      processedAt?: Date;
      expiresAt?: Date | null;
      dataPayload?: Prisma.InputJsonValue | null;
    },
  ): Promise<Request | null> {
    const updateData: Prisma.RequestUpdateManyMutationInput = {
      status: RequestStatus.COMPLETED,
      errorMessage: null,
      processedAt: data?.processedAt ?? new Date(),
    };

    if (data?.expiresAt !== undefined) {
      updateData.expiresAt = data.expiresAt;
    }

    if (data?.dataPayload !== undefined) {
      if (data.dataPayload === null) {
        updateData.dataPayload = Prisma.JsonNull;
      } else {
        updateData.dataPayload = data.dataPayload;
      }
    }

    const updated = await this.prisma.request.updateMany({
      where: {
        id,
        status: RequestStatus.PROCESSING,
      },
      data: updateData,
    });

    if (updated.count === 0) {
      return null;
    }

    return await this.findRequestById(id);
  }

  /**
   * Mark request as failed.
   */
  async markRequestFailed(id: string, errorMessage: string): Promise<Request | null> {
    const updated = await this.prisma.request.updateMany({
      where: {
        id,
        status: RequestStatus.PROCESSING,
      },
      data: {
        status: RequestStatus.FAILED,
        processedAt: new Date(),
        errorMessage,
      },
    });

    if (updated.count === 0) {
      return null;
    }

    return await this.findRequestById(id);
  }

  /**
   * Retry a failed request by moving it back to PENDING.
   * Monotonic guard: only FAILED rows can transition to PENDING here.
   */
  async retryFailedRequest(id: string): Promise<Request | null> {
    const updated = await this.prisma.request.updateMany({
      where: {
        id,
        status: RequestStatus.FAILED,
      },
      data: {
        status: RequestStatus.PENDING,
        errorMessage: null,
        processedAt: null,
      },
    });

    if (updated.count === 0) {
      return null;
    }

    return await this.findRequestById(id);
  }

  /**
   * Mark request as cancelled.
   *
   * Used when a user cancels a pending deletion request or
   * when a request is superseded by another operation.
   */
  async markRequestCancelled(id: string): Promise<Request | null> {
    const updated = await this.prisma.request.updateMany({
      where: {
        id,
        status: {
          in: [RequestStatus.PENDING, RequestStatus.PROCESSING],
        },
      },
      data: {
        status: RequestStatus.CANCELLED,
      },
    });

    if (updated.count === 0) {
      return null;
    }

    return await this.findRequestById(id);
  }

  /**
   * Mark completed request as expired.
   * Monotonic guard: only COMPLETED rows can transition to EXPIRED.
   */
  async markRequestExpired(id: string): Promise<Request | null> {
    const updated = await this.prisma.request.updateMany({
      where: {
        id,
        status: RequestStatus.COMPLETED,
      },
      data: {
        status: RequestStatus.EXPIRED,
      },
    });

    if (updated.count === 0) {
      return null;
    }

    return await this.findRequestById(id);
  }

  /**
   * Check if identity has a pending request of the given type.
   */
  async hasPendingRequest(identityId: string, requestType: RequestType): Promise<boolean> {
    const count = await this.prisma.request.count({
      where: {
        identityId,
        requestType,
        status: { in: [RequestStatus.PENDING, RequestStatus.PROCESSING] },
      },
    });
    return count > 0;
  }

  // ─────────────────────────────────────────────────────────────
  // Audit Log Operations
  // ─────────────────────────────────────────────────────────────

  /**
   * Create an audit log entry.
   * Audit logs are immutable - no update/delete operations.
   */
  async createAuditLog(data: {
    identityId: string;
    action: GdprAuditAction;
    entityType?: string;
    metadata?: Record<string, unknown>;
    performedBy: string;
  }): Promise<GdprAuditLog> {
    return await this.prisma.gdprAuditLog.create({
      data: {
        identityId: data.identityId,
        action: data.action,
        entityType: data.entityType ?? null,
        metadata:
          data.metadata !== undefined ? (data.metadata as Prisma.InputJsonValue) : Prisma.DbNull,
        performedBy: data.performedBy,
      },
    });
  }

  /**
   * Find audit logs for an identity.
   */
  async findAuditLogsByIdentity(identityId: string): Promise<GdprAuditLog[]> {
    return await this.prisma.gdprAuditLog.findMany({
      where: { identityId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
