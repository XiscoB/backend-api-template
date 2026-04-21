import { Controller, Get, Param, Query, UseGuards, Logger } from '@nestjs/common';
import { GdprAdminService, AdminGdprRequestView, AdminGdprMetrics } from '../gdpr-admin.service';
import { GdprAdminListRequestsDto, GdprAdminGetRequestDto } from './dto/gdpr-admin.dto';
import { AdminPrivilegeGuard } from '../../internal-admin/admin-privilege.guard';
import { AdminReadOnly } from '../../internal-admin/admin.decorators';
import { CurrentAdminUser } from '../../internal-admin/current-admin-user.decorator';
import { AdminUser } from '../../internal-admin/admin.types';
import { SkipResponseWrap } from '../../../common/decorators';

/**
 * GDPR Admin Controller (Phase 6)
 *
 * Provides read-only access to GDPR requests for internal admin users.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GET /api/internal/gdpr/requests
 *   - Lists all GDPR requests (paginated)
 *   - Supports filtering by requestType and status
 *
 * GET /api/internal/gdpr/requests/:id
 *   - Gets a single GDPR request by ID
 *
 * GET /api/internal/gdpr/metrics
 *   - Returns aggregated GDPR metrics
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SECURITY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * - All endpoints require ADMIN or SYSTEM role
 * - All endpoints are read-only
 * - No write, delete, or processing operations
 * - Storage keys and presigned URLs are never exposed
 * - Audit logging is performed by the guard
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ROUTING
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Base path: /api/internal/gdpr
 *
 * This is separate from the user-facing GDPR controller (/api/v1/gdpr)
 * and the generic internal admin controller (/api/internal/admin).
 */
@Controller('internal/gdpr')
@UseGuards(AdminPrivilegeGuard)
@SkipResponseWrap()
export class GdprAdminController {
  private readonly logger = new Logger(GdprAdminController.name);

  constructor(private readonly gdprAdminService: GdprAdminService) {}

  /**
   * List all GDPR requests.
   *
   * GET /api/internal/gdpr/requests
   *
   * Query parameters:
   * - requestType: Filter by type (GDPR_EXPORT, GDPR_DELETE, etc.)
   * - status: Filter by status (PENDING, COMPLETED, etc.)
   * - limit: Max results (default 20, max 100)
   * - offset: Pagination offset
   */
  @Get('requests')
  @AdminReadOnly()
  async listRequests(
    @Query() query: GdprAdminListRequestsDto,
    @CurrentAdminUser() user: AdminUser,
  ): Promise<{
    data: AdminGdprRequestView[];
    meta: { total: number; limit: number; offset: number };
  }> {
    this.logger.log(
      `Admin ${user.sub} listing GDPR requests: type=${query.requestType ?? 'all'}, status=${query.status ?? 'all'}`,
    );

    const result = await this.gdprAdminService.listRequests({
      requestType: query.requestType,
      status: query.status,
      limit: query.getLimit(),
      offset: query.getOffset(),
    });

    return {
      data: result.requests,
      meta: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    };
  }

  /**
   * Get a single GDPR request.
   *
   * GET /api/internal/gdpr/requests/:id
   */
  @Get('requests/:id')
  @AdminReadOnly()
  async getRequest(
    @Param() params: GdprAdminGetRequestDto,
    @CurrentAdminUser() user: AdminUser,
  ): Promise<{ data: AdminGdprRequestView }> {
    this.logger.log(`Admin ${user.sub} viewing GDPR request: ${params.id}`);

    const request = await this.gdprAdminService.getRequest(params.id);

    return {
      data: request,
    };
  }

  /**
   * Get aggregated GDPR metrics.
   *
   * GET /api/internal/gdpr/metrics
   *
   * Returns:
   * - Total requests count
   * - Counts by type and status
   * - Pending/expired export counts
   * - Total download count
   */
  @Get('metrics')
  @AdminReadOnly()
  async getMetrics(@CurrentAdminUser() user: AdminUser): Promise<{ data: AdminGdprMetrics }> {
    this.logger.log(`Admin ${user.sub} viewing GDPR metrics`);

    const metrics = await this.gdprAdminService.getMetrics();

    return {
      data: metrics,
    };
  }
}
