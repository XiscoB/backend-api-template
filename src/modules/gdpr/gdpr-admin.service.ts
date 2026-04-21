import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * GDPR Admin Service (Phase 6)
 *
 * Provides read-only access to GDPR requests for internal admin users.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURITY CONSIDERATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This service is ONLY for ADMIN/SYSTEM roles. It exposes:
 * - Request metadata (IDs, status, timestamps)
 * - Aggregated metrics (download counts)
 * - Identity references (but NOT the actual user data)
 *
 * It does NOT expose:
 * - Presigned URLs or storage keys
 * - Actual export content
 * - PII beyond what's necessary for identification
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OPERATIONS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - listRequests: Paginated list with filtering
 * - getRequest: Single request details
 * - getMetrics: Aggregated system metrics
 *
 * All operations are READ-ONLY. This service does NOT:
 * - Create, update, or delete requests
 * - Trigger processing or cleanup
 * - Grant download access
 */

/**
 * Sanitized GDPR request for admin viewing.
 *
 * Does NOT include:
 * - Storage keys
 * - Presigned URLs
 * - Actual export data
 */
export interface AdminGdprRequestView {
  id: string;
  requestType: string;
  status: string;
  identityId: string;
  createdAt: Date;
  processedAt: Date | null;
  expiresAt: Date | null;
  downloadCount: number;
  lastDownloadedAt: Date | null;
  hasExportData: boolean;
  exportFileSize: number | null;
}

/**
 * Paginated list result.
 */
export interface AdminGdprRequestListResult {
  requests: AdminGdprRequestView[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Aggregated GDPR metrics.
 */
export interface AdminGdprMetrics {
  totalRequests: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  pendingExports: number;
  expiredExports: number;
  totalDownloads: number;
}

@Injectable()
export class GdprAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List GDPR requests with filtering and pagination.
   */
  async listRequests(params: {
    requestType?: string;
    status?: string;
    limit: number;
    offset: number;
  }): Promise<AdminGdprRequestListResult> {
    const where: Record<string, unknown> = {};

    if (params.requestType) {
      where.requestType = params.requestType;
    }

    if (params.status) {
      where.status = params.status;
    }

    const [requests, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        select: {
          id: true,
          requestType: true,
          status: true,
          identityId: true,
          createdAt: true,
          processedAt: true,
          expiresAt: true,
          downloadCount: true,
          lastDownloadedAt: true,
          dataPayload: true, // Needed to check if export exists
        },
        orderBy: { createdAt: 'desc' },
        take: params.limit,
        skip: params.offset,
      }),
      this.prisma.request.count({ where }),
    ]);

    return {
      requests: requests.map((r) => this.sanitizeRequest(r)),
      total,
      limit: params.limit,
      offset: params.offset,
    };
  }

  /**
   * Get a single GDPR request by ID.
   */
  async getRequest(requestId: string): Promise<AdminGdprRequestView> {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        requestType: true,
        status: true,
        identityId: true,
        createdAt: true,
        processedAt: true,
        expiresAt: true,
        downloadCount: true,
        lastDownloadedAt: true,
        dataPayload: true,
      },
    });

    if (!request) {
      throw new NotFoundException(`GDPR request ${requestId} not found`);
    }

    return this.sanitizeRequest(request);
  }

  /**
   * Get aggregated GDPR metrics.
   */
  async getMetrics(): Promise<AdminGdprMetrics> {
    // Get total count
    const totalRequests = await this.prisma.request.count();

    // Get counts by type
    const byTypeRaw = await this.prisma.request.groupBy({
      by: ['requestType'],
      _count: true,
    });
    const byType: Record<string, number> = {};
    for (const item of byTypeRaw) {
      byType[item.requestType] = item._count;
    }

    // Get counts by status
    const byStatusRaw = await this.prisma.request.groupBy({
      by: ['status'],
      _count: true,
    });
    const byStatus: Record<string, number> = {};
    for (const item of byStatusRaw) {
      byStatus[item.status] = item._count;
    }

    // Get pending exports
    const pendingExports = await this.prisma.request.count({
      where: {
        requestType: 'GDPR_EXPORT',
        status: { in: ['PENDING', 'PROCESSING'] },
      },
    });

    // Get expired exports (awaiting cleanup)
    const expiredExports = await this.prisma.request.count({
      where: {
        requestType: 'GDPR_EXPORT',
        status: 'COMPLETED',
        expiresAt: { lt: new Date() },
      },
    });

    // Get total download count
    const downloadSum = await this.prisma.request.aggregate({
      _sum: { downloadCount: true },
      where: { requestType: 'GDPR_EXPORT' },
    });

    return {
      totalRequests,
      byType,
      byStatus,
      pendingExports,
      expiredExports,
      totalDownloads: downloadSum._sum.downloadCount ?? 0,
    };
  }

  /**
   * Sanitize a request for admin viewing.
   *
   * Removes sensitive fields like storage keys.
   */
  private sanitizeRequest(request: {
    id: string;
    requestType: string;
    status: string;
    identityId: string;
    createdAt: Date;
    processedAt: Date | null;
    expiresAt: Date | null;
    downloadCount: number;
    lastDownloadedAt: Date | null;
    dataPayload: unknown;
  }): AdminGdprRequestView {
    // Extract file size from payload (without exposing storage key)
    const payload = request.dataPayload as Record<string, unknown> | null;
    const fileSize = typeof payload?.fileSize === 'number' ? payload.fileSize : null;

    return {
      id: request.id,
      requestType: request.requestType,
      status: request.status,
      identityId: request.identityId,
      createdAt: request.createdAt,
      processedAt: request.processedAt,
      expiresAt: request.expiresAt,
      downloadCount: request.downloadCount,
      lastDownloadedAt: request.lastDownloadedAt,
      hasExportData: payload?.storageKey != null,
      exportFileSize: fileSize,
    };
  }
}
