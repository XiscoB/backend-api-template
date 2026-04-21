/**
 * Request Monitoring Types
 *
 * Types for monitoring the generic Request lifecycle.
 * This is platform infrastructure, not product logic.
 *
 * Monitoring is:
 * - Detection-only (no auto-remediation)
 * - Hook-based (emits events, doesn't act)
 * - Opt-in (hooks are optional)
 */

// ─────────────────────────────────────────────────────────────
// Monitoring Configuration
// ─────────────────────────────────────────────────────────────

/**
 * Configuration for request monitoring detection.
 *
 * All thresholds have safe defaults.
 * Override via environment variables or dependency injection.
 */
export interface RequestMonitoringConfig {
  /**
   * Minutes after which a PROCESSING request is considered stuck.
   * Default: 60 minutes
   */
  stuckThresholdMinutes: number;
}

/**
 * Default monitoring configuration.
 * Safe defaults for production use.
 */
export const DEFAULT_MONITORING_CONFIG: RequestMonitoringConfig = {
  stuckThresholdMinutes: 60,
};

// ─────────────────────────────────────────────────────────────
// Problematic Request Types
// ─────────────────────────────────────────────────────────────

/**
 * Minimal request metadata for monitoring hooks.
 *
 * Does NOT include user data or payloads.
 * Only contains what's needed for alerting/logging.
 */
export interface ProblematicRequestInfo {
  /** Request ID */
  id: string;
  /** Request type (GDPR_EXPORT, GDPR_DELETE, etc.) */
  requestType: string;
  /** Current status */
  status: string;
  /** When the request was created */
  createdAt: Date;
  /** When the request was last updated */
  updatedAt: Date;
  /** How long the request has been in current state (minutes) */
  ageMinutes: number;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Result of a monitoring detection run.
 */
export interface MonitoringDetectionResult {
  /** Requests stuck in PROCESSING state */
  stuckRequests: ProblematicRequestInfo[];
  /** Requests in FAILED state */
  failedRequests: ProblematicRequestInfo[];
  /** When this detection was performed */
  detectedAt: Date;
}

// ─────────────────────────────────────────────────────────────
// Monitoring Hook Interface
// ─────────────────────────────────────────────────────────────

/**
 * Hook for request monitoring events.
 *
 * Implement this interface to receive notifications about problematic requests.
 * The base system detects issues but does NOT act - hooks decide what to do.
 *
 * Use cases for extending projects:
 * - Send Slack alerts
 * - Send email notifications
 * - Log to external monitoring systems
 * - Trigger automated remediation (carefully)
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class SlackMonitoringHook implements RequestMonitoringHook {
 *   async onStuckRequest(request: ProblematicRequestInfo): Promise<void> {
 *     await this.slackService.sendAlert(`Request ${request.id} stuck for ${request.ageMinutes}m`);
 *   }
 *
 *   async onFailedRequest(request: ProblematicRequestInfo): Promise<void> {
 *     await this.slackService.sendAlert(`Request ${request.id} failed: ${request.errorMessage}`);
 *   }
 * }
 * ```
 *
 * Registration:
 * ```typescript
 * @Module({
 *   providers: [
 *     { provide: REQUEST_MONITORING_HOOKS, useClass: SlackMonitoringHook, multi: true },
 *   ],
 * })
 * export class MonitoringModule {}
 * ```
 */
export interface RequestMonitoringHook {
  /**
   * Called when a request is detected as stuck in PROCESSING state.
   *
   * @param request - Minimal request metadata (no user data)
   */
  onStuckRequest(request: ProblematicRequestInfo): Promise<void>;

  /**
   * Called when a request is detected in FAILED state.
   *
   * @param request - Minimal request metadata (no user data)
   */
  onFailedRequest(request: ProblematicRequestInfo): Promise<void>;
}

/**
 * Injection token for request monitoring hooks.
 *
 * Use with @Inject(REQUEST_MONITORING_HOOKS) to get all registered hooks.
 */
export const REQUEST_MONITORING_HOOKS = Symbol('REQUEST_MONITORING_HOOKS');
