import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  RequestMonitoringHook,
  REQUEST_MONITORING_HOOKS,
  RequestMonitoringConfig,
  DEFAULT_MONITORING_CONFIG,
  ProblematicRequestInfo,
  MonitoringDetectionResult,
} from '../../common/types/request-monitoring.types';

/**
 * Request Monitoring Service
 *
 * Detects problematic requests (stuck, failed) and emits hooks.
 * This is platform observability infrastructure, not product logic.
 *
 * Design principles:
 * - Detection only: Does NOT retry, cancel, or modify requests
 * - Hook-based: Emits events, lets hooks decide what to do
 * - Opt-in: Works without any hooks registered (just logs warnings)
 * - Safe: Does not expose user data in hooks
 *
 * Usage:
 * - Call detectProblematicRequests() from a cron job
 * - Register hooks to receive alerts
 * - Configure thresholds via config
 *
 * @example
 * ```typescript
 * // In a cron job or scheduled task
 * await requestMonitoringService.detectProblematicRequests({
 *   processingOlderThanMinutes: 30,
 * });
 * ```
 */
@Injectable()
export class RequestMonitoringService {
  private readonly logger = new Logger(RequestMonitoringService.name);
  private readonly config: RequestMonitoringConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(REQUEST_MONITORING_HOOKS)
    private readonly monitoringHooks?: RequestMonitoringHook[],
  ) {
    // Use default config - can be extended to use ConfigService
    this.config = DEFAULT_MONITORING_CONFIG;
  }

  // ─────────────────────────────────────────────────────────────
  // Public API - Cron-Compatible Detection
  // ─────────────────────────────────────────────────────────────

  /**
   * Detect problematic requests and emit hooks.
   *
   * Finds:
   * - Requests stuck in PROCESSING longer than threshold
   * - Requests in FAILED state
   *
   * For each problematic request:
   * - Logs a warning
   * - Invokes registered monitoring hooks
   *
   * This method is idempotent and safe to call repeatedly.
   * It does NOT modify any requests.
   *
   * @param options - Detection options
   * @returns Summary of detected problems
   */
  async detectProblematicRequests(options?: {
    processingOlderThanMinutes?: number;
  }): Promise<MonitoringDetectionResult> {
    const stuckThreshold = options?.processingOlderThanMinutes ?? this.config.stuckThresholdMinutes;

    this.logger.debug(`Running request monitoring (stuck threshold: ${stuckThreshold}m)`);

    const now = new Date();

    // Find stuck requests (PROCESSING for too long)
    const stuckRequests = await this.findStuckRequests(stuckThreshold, now);

    // Find failed requests (all FAILED)
    const failedRequests = await this.findFailedRequests(now);

    // Log warnings
    if (stuckRequests.length > 0) {
      this.logger.warn(`Detected ${stuckRequests.length} stuck request(s) in PROCESSING state`);
    }

    if (failedRequests.length > 0) {
      this.logger.warn(`Detected ${failedRequests.length} failed request(s)`);
    }

    // Emit hooks for stuck requests
    for (const request of stuckRequests) {
      await this.emitStuckRequestHook(request);
    }

    // Emit hooks for failed requests
    for (const request of failedRequests) {
      await this.emitFailedRequestHook(request);
    }

    return {
      stuckRequests,
      failedRequests,
      detectedAt: now,
    };
  }

  /**
   * Get current monitoring status (no side effects).
   *
   * Use this for health checks or dashboards.
   * Does NOT emit hooks - just returns data.
   */
  async getMonitoringStatus(options?: {
    processingOlderThanMinutes?: number;
  }): Promise<MonitoringDetectionResult> {
    const stuckThreshold = options?.processingOlderThanMinutes ?? this.config.stuckThresholdMinutes;
    const now = new Date();

    const stuckRequests = await this.findStuckRequests(stuckThreshold, now);
    const failedRequests = await this.findFailedRequests(now);

    return {
      stuckRequests,
      failedRequests,
      detectedAt: now,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Internal Detection Logic
  // ─────────────────────────────────────────────────────────────

  /**
   * Find requests stuck in PROCESSING state.
   */
  private async findStuckRequests(
    thresholdMinutes: number,
    now: Date,
  ): Promise<ProblematicRequestInfo[]> {
    const thresholdDate = new Date(now.getTime() - thresholdMinutes * 60 * 1000);

    const requests = await this.prisma.request.findMany({
      where: {
        status: RequestStatus.PROCESSING,
        createdAt: { lt: thresholdDate }, // Stuck = created long ago but still processing
      },
      select: {
        id: true,
        requestType: true,
        status: true,
        createdAt: true,
        processedAt: true,
        errorMessage: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return requests.map((r) => ({
      id: r.id,
      requestType: r.requestType,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.processedAt ?? r.createdAt, // Use processedAt if available, else createdAt
      ageMinutes: Math.floor((now.getTime() - r.createdAt.getTime()) / (60 * 1000)),
      errorMessage: r.errorMessage ?? undefined,
    }));
  }

  /**
   * Find requests in FAILED state.
   */
  private async findFailedRequests(now: Date): Promise<ProblematicRequestInfo[]> {
    const requests = await this.prisma.request.findMany({
      where: {
        status: RequestStatus.FAILED,
      },
      select: {
        id: true,
        requestType: true,
        status: true,
        createdAt: true,
        processedAt: true,
        errorMessage: true,
      },
      orderBy: { processedAt: 'desc' },
    });

    return requests.map((r) => ({
      id: r.id,
      requestType: r.requestType,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.processedAt ?? r.createdAt, // Use processedAt if available, else createdAt
      ageMinutes: Math.floor(
        (now.getTime() - (r.processedAt ?? r.createdAt).getTime()) / (60 * 1000),
      ),
      errorMessage: r.errorMessage ?? undefined,
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // Hook Invocation
  // ─────────────────────────────────────────────────────────────

  /**
   * Invoke hooks for a stuck request.
   *
   * Hook failures are logged but do not throw.
   */
  private async emitStuckRequestHook(request: ProblematicRequestInfo): Promise<void> {
    if (!this.monitoringHooks || this.monitoringHooks.length === 0) {
      return;
    }

    for (const hook of this.monitoringHooks) {
      try {
        await hook.onStuckRequest(request);
      } catch (error) {
        this.logger.error(
          `Monitoring hook failed for stuck request ${request.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Invoke hooks for a failed request.
   *
   * Hook failures are logged but do not throw.
   */
  private async emitFailedRequestHook(request: ProblematicRequestInfo): Promise<void> {
    if (!this.monitoringHooks || this.monitoringHooks.length === 0) {
      return;
    }

    for (const hook of this.monitoringHooks) {
      try {
        await hook.onFailedRequest(request);
      } catch (error) {
        this.logger.error(
          `Monitoring hook failed for failed request ${request.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
