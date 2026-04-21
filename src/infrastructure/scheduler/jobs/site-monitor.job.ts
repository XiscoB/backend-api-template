import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AlertDeliveryService, RecipientGroup } from '../../delivery';
import { AppConfigService } from '../../../config/app-config.service';

/**
 * Site availability check result.
 */
interface SiteCheckResult {
  url: string;
  success: boolean;
  status?: number;
  error?: string;
}

/**
 * Site Monitor Job
 *
 * Periodically checks external URLs for availability and sends
 * rate-limited infra alerts when sites are down.
 *
 * BEHAVIOR:
 * - HTTP GET to each configured URL
 * - Checks status code against expected value
 * - Consolidates all failures into a single alert
 * - Rate-limits alerts via InternalLog (30m debounce)
 *
 * CONFIGURATION:
 * - SITE_MONITOR_TARGETS: comma-separated URLs
 * - SITE_MONITOR_EXPECTED_STATUS: expected HTTP status (default: 200)
 * - SITE_MONITOR_TIMEOUT_MS: request timeout (default: 5000)
 * - SITE_MONITOR_CHECK_CRON: check frequency (default: every 5 minutes)
 *
 * @module infrastructure/scheduler/jobs
 */
@Injectable()
export class SiteMonitorJob {
  private readonly logger = new Logger(SiteMonitorJob.name);
  private readonly ALERT_DEBOUNCE_MINUTES = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertDeliveryService: AlertDeliveryService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Main entry point.
   * Checks all configured sites and sends alert if any are down.
   * Never throws (fail-safe).
   */
  async run(): Promise<void> {
    try {
      const targets = this.config.siteMonitorTargets;

      if (targets.length === 0) {
        this.logger.debug('No site monitor targets configured, skipping check');
        return;
      }

      const results = await this.checkAllSites(targets);
      const failures = results.filter((r) => !r.success);

      if (failures.length > 0) {
        await this.sendAlertIfNotRateLimited(failures);
      }
    } catch (error) {
      // Fail-safe: Log but do not crash the scheduler
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Site monitor job failed: ${errorMessage}`);

      // Log to InternalLog for audit trail
      try {
        await this.prisma.internalLog.create({
          data: {
            level: 'ERROR',
            source: 'SiteMonitorJob',
            message: 'Site monitor job failed',
            context: { error: errorMessage },
          },
        });
      } catch {
        // Double fault - just log to console
        this.logger.error('Failed to log job failure to InternalLog');
      }
    }
  }

  /**
   * Check all sites and return results.
   */
  private async checkAllSites(urls: string[]): Promise<SiteCheckResult[]> {
    const timeout = this.config.siteMonitorTimeoutMs;
    const expectedStatus = this.config.siteMonitorExpectedStatus;

    const results = await Promise.all(
      urls.map((url) => this.checkSite(url, timeout, expectedStatus)),
    );

    return results;
  }

  /**
   * Check a single site for availability.
   * Uses native fetch with AbortController for timeout.
   */
  private async checkSite(
    url: string,
    timeoutMs: number,
    expectedStatus: number,
  ): Promise<SiteCheckResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        // Don't follow redirects to accurately check status
        redirect: 'manual',
      });

      clearTimeout(timeoutId);

      if (response.status !== expectedStatus) {
        return {
          url,
          success: false,
          status: response.status,
          error: `Expected status ${expectedStatus}, got ${response.status}`,
        };
      }

      return { url, success: true, status: response.status };
    } catch (error) {
      clearTimeout(timeoutId);

      // Normalize error messages for readability
      let errorMessage: string;
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = `Timeout after ${timeoutMs}ms`;
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('getaddrinfo')) {
          errorMessage = 'DNS resolution failed';
        } else if (error.message.includes('ECONNREFUSED')) {
          errorMessage = 'Connection refused';
        } else if (error.message.includes('ETIMEDOUT')) {
          errorMessage = `Connection timeout after ${timeoutMs}ms`;
        } else {
          errorMessage = error.message;
        }
      } else {
        errorMessage = String(error);
      }

      return {
        url,
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send alert for failed sites, if not rate-limited.
   * Rate-limiting uses InternalLog as soft state.
   */
  private async sendAlertIfNotRateLimited(failures: SiteCheckResult[]): Promise<void> {
    const now = new Date();
    const debounceStart = new Date(now.getTime() - this.ALERT_DEBOUNCE_MINUTES * 60 * 1000);

    // Create debounce key from sorted failing URLs
    const failingUrls = failures.map((f) => f.url).sort();
    const debounceKey = `site-monitor:${failingUrls.join(',')}`;

    // Check for recent alert with same failures
    const recentAlert = await this.prisma.internalLog.findFirst({
      where: {
        source: 'SiteMonitorJob',
        level: 'WARN',
        message: 'Site Monitor Alert Sent',
        context: {
          path: ['debounceKey'],
          equals: debounceKey,
        },
        createdAt: { gte: debounceStart },
      },
    });

    if (recentAlert) {
      this.logger.debug(
        `Skipping site monitor alert - rate limited (last sent: ${recentAlert.createdAt.toISOString()})`,
      );
      return;
    }

    // Build alert body
    const timestamp = now.toISOString();
    const failureList = failures
      .map((f) => {
        const reason = f.error ?? `Status: ${f.status}`;
        return `<li><strong>${this.escapeHtml(f.url)}</strong>: ${this.escapeHtml(reason)}</li>`;
      })
      .join('\n');

    const htmlBody = `
      <h3>External Site Unavailable</h3>
      <p><strong>Impact:</strong> One or more external sites failed availability checks.</p>
      <ul>
        ${failureList}
      </ul>
      <p><small>Detected at: ${timestamp}</small></p>
      <p><small>This alert is rate-limited to once every ${this.ALERT_DEBOUNCE_MINUTES} minutes for the same set of failures.</small></p>
    `;

    // Send alert
    const result = await this.alertDeliveryService.sendAlert({
      recipientGroup: RecipientGroup.INFRA_ALERTS,
      severity: 'CRITICAL',
      title: 'External Site Unavailable',
      htmlBody,
    });

    if (result.sent) {
      // Log for rate-limiting
      await this.prisma.internalLog.create({
        data: {
          level: 'WARN',
          source: 'SiteMonitorJob',
          message: 'Site Monitor Alert Sent',
          context: { debounceKey, failingUrls },
        },
      });
    }
  }

  /**
   * Escape HTML special characters.
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
