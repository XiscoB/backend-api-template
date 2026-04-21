import { Controller, Get, Post, Query, Body, Param, UseGuards, Logger } from '@nestjs/common';
import { InternalAdminService } from './internal-admin.service';
import { AdminPrivilegeGuard } from './admin-privilege.guard';
import { AdminReadOnly, AdminWriteRequired } from './admin.decorators';
import { CurrentAdminUser } from './current-admin-user.decorator';
import { AdminUser, AdminTableInfo } from './admin.types';
import { GdprCoverageSummary, GdprTableCoverageInfo } from './gdpr-coverage.service';
import { AdminQueryDto, AdminUpdateDto } from './dto';
import { SkipResponseWrap } from '../../common/decorators';
import { CleanupCronService } from '../../infrastructure/cleanup';
import { GdprCoverageService } from './gdpr-coverage.service';

/**
 * Internal Admin Controller.
 *
 * Provides controlled access to database tables for operational use.
 *
 * Security:
 * - All routes require valid JWT with admin privileges
 * - JwtAuthGuard is applied globally (don't repeat it here)
 * - AdminPrivilegeGuard checks for admin privileges
 * - Explicit privilege requirements on each endpoint
 * - No bulk operations, no deletes
 *
 * Rate limiting:
 * - Uses strictest authenticated tier (rl-internal-admin-strict)
 *
 * Routing:
 * - Controller prefix is internal/admin
 * - Global prefix "api" is NOT excluded for admin routes
 * - Routes appear at /api/internal/admin/*
 */
@Controller('internal/admin')
@UseGuards(AdminPrivilegeGuard)
@SkipResponseWrap()
export class InternalAdminController {
  private readonly logger = new Logger(InternalAdminController.name);

  constructor(
    private readonly adminService: InternalAdminService,
    private readonly cleanupService: CleanupCronService,
    private readonly gdprCoverageService: GdprCoverageService,
  ) {}

  /**
   * List all visible tables with their permissions.
   */
  @Get('tables')
  @AdminReadOnly()
  listTables(@CurrentAdminUser() user: AdminUser): { data: AdminTableInfo[] } {
    this.logger.log(`Admin ${user.sub} listing tables`);
    return {
      data: this.adminService.listTables(),
    };
  }

  /**
   * Query records from a table.
   */
  @Get('query')
  @AdminReadOnly()
  async queryTable(
    @Query() query: AdminQueryDto,
    @CurrentAdminUser() user: AdminUser,
  ): Promise<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }> {
    const limit = query.getLimit();
    const offset = query.getOffset();

    const result = await this.adminService.queryTable(
      {
        table: query.table,
        limit,
        offset,
        filterField: query.filterField,
        filterValue: query.filterValue,
      },
      user.sub,
    );

    return {
      data: result.records,
      meta: {
        total: result.total,
        limit,
        offset,
      },
    };
  }

  /**
   * Get a single record by ID.
   */
  @Get('record/:table/:id')
  @AdminReadOnly()
  async getRecord(
    @Param('table') table: string,
    @Param('id') id: string,
    @CurrentAdminUser() user: AdminUser,
  ): Promise<{ data: unknown }> {
    const record = await this.adminService.getRecord(table, id, user.sub);
    return { data: record };
  }

  /**
   * Update a single record.
   *
   * Requires ADMIN_WRITE privilege.
   * Only works on tables in WRITEABLE_TABLES.
   */
  @Post('update')
  @AdminWriteRequired()
  async updateRecord(
    @Body() body: AdminUpdateDto,
    @CurrentAdminUser() user: AdminUser,
  ): Promise<{ data: unknown }> {
    const result = await this.adminService.updateRecord(
      {
        table: body.table,
        id: body.id,
        data: body.data,
      },
      user.sub,
    );

    return { data: result };
  }

  /**
   * Health check for admin console.
   */
  @Get('health')
  @AdminReadOnly()
  health(@CurrentAdminUser() user: AdminUser): {
    data: { status: string; privilege: string; timestamp: string };
  } {
    return {
      data: {
        status: 'ok',
        privilege: user.adminPrivilege,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * List available infrastructure cleanup jobs.
   */
  @Get('cleanup/jobs')
  @AdminReadOnly()
  listCleanupJobs(@CurrentAdminUser() user: AdminUser): { data: string[] } {
    this.logger.log(`Admin ${user.sub} listing cleanup jobs`);
    return {
      data: this.cleanupService.getAvailableCleanups(),
    };
  }

  /**
   * Run all infrastructure cleanup jobs.
   *
   * Requires ADMIN_WRITE privilege.
   * This manually triggers all registered cleanup jobs.
   */
  @Post('cleanup/run-all')
  @AdminWriteRequired()
  async runAllCleanups(@CurrentAdminUser() user: AdminUser): Promise<{
    data: {
      totalRecordsDeleted: number;
      durationMs: number;
      jobs: Array<{
        name: string;
        recordsDeleted: number;
        durationMs: number;
        error?: string;
        metadata?: Record<string, unknown>;
      }>;
    };
  }> {
    this.logger.warn(`Admin ${user.sub} triggered manual cleanup run`);
    const result = await this.cleanupService.runAllCleanups();

    return {
      data: {
        totalRecordsDeleted: result.totalRecordsDeleted,
        durationMs: result.durationMs,
        jobs: Array.from(result.results.entries()).map(([name, res]) => ({
          name,
          recordsDeleted: res.recordsDeleted,
          durationMs: res.durationMs,
          error: res.error,
          metadata: res.metadata,
        })),
      },
    };
  }

  /**
   * Run a specific cleanup job by name.
   *
   * Requires ADMIN_WRITE privilege.
   * Useful for testing or running a single cleanup.
   */
  @Post('cleanup/run/:job')
  @AdminWriteRequired()
  async runSpecificCleanup(
    @Param('job') jobName: string,
    @CurrentAdminUser() user: AdminUser,
  ): Promise<{
    data: {
      name: string;
      recordsDeleted: number;
      durationMs: number;
      error?: string;
      metadata?: Record<string, unknown>;
    } | null;
    error?: string;
  }> {
    this.logger.warn(`Admin ${user.sub} triggered cleanup: ${jobName}`);
    const result = await this.cleanupService.runCleanup(jobName);

    if (!result) {
      return {
        data: null,
        error: `Cleanup job "${jobName}" not found`,
      };
    }

    return {
      data: {
        name: jobName,
        recordsDeleted: result.recordsDeleted,
        durationMs: result.durationMs,
        error: result.error,
        metadata: result.metadata,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────
  // GDPR Coverage
  // ─────────────────────────────────────────────────────────────

  /**
   * Get GDPR coverage status for all database tables.
   *
   * Returns a summary showing:
   * - ✅ Tables included in GDPR exports
   * - 🚫 Tables explicitly excluded (infrastructure)
   * - ⚠️ Tables not registered (WARNING - potential gap)
   *
   * This is a read-only view for compliance visibility.
   */
  @Get('gdpr/coverage')
  @AdminReadOnly()
  getGdprCoverage(@CurrentAdminUser() user: AdminUser): { data: GdprCoverageSummary } {
    this.logger.log(`Admin ${user.sub} viewing GDPR coverage`);
    const summary = this.gdprCoverageService.getCoverageSummary();

    return {
      data: summary,
    };
  }

  /**
   * Get tables with GDPR coverage warnings.
   *
   * Returns only tables that are not registered in the GDPR registry.
   * These represent potential compliance gaps.
   */
  @Get('gdpr/warnings')
  @AdminReadOnly()
  getGdprWarnings(@CurrentAdminUser() user: AdminUser): {
    data: { count: number; tables: GdprTableCoverageInfo[]; hasWarnings: boolean };
  } {
    this.logger.log(`Admin ${user.sub} viewing GDPR warnings`);
    const warnings = this.gdprCoverageService.getWarnings();

    return {
      data: {
        count: warnings.length,
        tables: warnings,
        hasWarnings: warnings.length > 0,
      },
    };
  }
}
