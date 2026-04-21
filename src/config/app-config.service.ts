import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerMode } from '../infrastructure/scheduler/scheduler.types';
import { TESTING } from './app.constants';

// Static test keys for scenario testing (matches scripts/dev/scenarios/lib/test-keys.js)
const SCENARIO_TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApFGMJsPugVnoVmRUAyW6
+nb1azFvqCuPsJvPl0vPNKje/bzPf3ZlQdy+p657YbMKWLwA+5Mh3zXOMqGidoBO
gOL0MlHEIG3GynjslzdHa4Ic/8/oC4AzmV9HqIeSjho9miwyedCX29RvQYNk83kA
2V7YGcMNeQCf8kAvxhaCZvf2hrNd6Y+6aq0KXSCSFrJD8WBSmMyrNaKOiGK64pMK
ZuL6Yf+cX+5kIWtmzBqvsYjnJTQvJJZFTstcOwu4iOXF3IsdOS0mMmjyfH4ZdpW5
gmtwV7oL5uagopYQP3/PKxJZSyTmO/x905am//co4DB5vCn/BZjS5hEZfY0xPEtC
TQIDAQAB
-----END PUBLIC KEY-----`;
const SCENARIO_TEST_ISSUER = 'scenario-test-issuer';
const SCENARIO_TEST_AUDIENCE = 'scenario-test-audience';

/**
 * Typed configuration service.
 *
 * Provides type-safe access to environment variables.
 * All values are validated at startup via Joi schema.
 *
 * Supports multiple identity providers:
 * - Supabase (HS256 with JWT secret, or JWKS)
 * - Auth0, Okta, Azure AD, Keycloak (RS256/ES256 with JWKS or public key)
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  // ─────────────────────────────────────────────────────────────
  // Application
  // ─────────────────────────────────────────────────────────────

  get nodeEnv(): string {
    return this.configService.get<string>('NODE_ENV', 'development');
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  /**
   * Whether scenario testing mode is enabled.
   *
   * SAFETY: This property returns true ONLY when:
   * 1. SCENARIO_TESTING environment variable is 'true'
   * 2. NODE_ENV is NOT 'production'
   *
   * When enabled, the backend accepts JWTs signed with the static test keypair
   * from scripts/dev/scenarios/lib/test-keys.js instead of production JWKS/keys.
   *
   * WARNING: This mode is for automated E2E testing only.
   * The test keys have no security value and are committed to git.
   */
  get scenarioTestingEnabled(): boolean {
    // Use constant as default, allow env var to override
    const defaultValue = TESTING.SCENARIO_TESTING_ENABLED ? 'true' : 'false';
    const scenarioTesting = this.configService.get<string>('SCENARIO_TESTING', defaultValue);
    const isEnabled = scenarioTesting.toLowerCase() === 'true';

    // HARD SAFETY CHECK: Never enable in production
    if (isEnabled && this.isProduction) {
      // eslint-disable-next-line no-console
      console.error(
        '[FATAL] SCENARIO_TESTING=true is forbidden in production. ' +
          'This would allow anyone with the test private key to forge JWTs.',
      );
      process.exit(1);
    }

    return isEnabled;
  }

  /**
   * Static test public key for scenario testing.
   * Only available when scenarioTestingEnabled is true.
   */
  get scenarioTestPublicKey(): string | undefined {
    return this.scenarioTestingEnabled ? SCENARIO_TEST_PUBLIC_KEY : undefined;
  }

  /**
   * Static test issuer for scenario testing.
   * Only available when scenarioTestingEnabled is true.
   */
  get scenarioTestIssuer(): string | undefined {
    return this.scenarioTestingEnabled ? SCENARIO_TEST_ISSUER : undefined;
  }

  /**
   * Static test audience for scenario testing.
   * Only available when scenarioTestingEnabled is true.
   */
  get scenarioTestAudience(): string | undefined {
    return this.scenarioTestingEnabled ? SCENARIO_TEST_AUDIENCE : undefined;
  }

  get port(): number {
    return this.configService.get<number>('PORT', 3000);
  }

  // ─────────────────────────────────────────────────────────────
  // Database
  // ─────────────────────────────────────────────────────────────

  get databaseUrl(): string {
    return this.configService.getOrThrow<string>('DATABASE_URL');
  }

  // ─────────────────────────────────────────────────────────────
  // JWT / Authentication
  // ─────────────────────────────────────────────────────────────

  get jwtIssuer(): string {
    return this.configService.getOrThrow<string>('JWT_ISSUER');
  }

  get jwtAudience(): string {
    return this.configService.getOrThrow<string>('JWT_AUDIENCE');
  }

  /**
   * JWT algorithm for token validation.
   * - RS256: Asymmetric RSA (JWKS or public key) — default
   * - HS256: Symmetric (JWT secret)
   * - ES256: Asymmetric EC (JWKS or public key)
   */
  get jwtAlgorithm(): 'RS256' | 'HS256' | 'ES256' {
    return this.configService.get<'RS256' | 'HS256' | 'ES256'>('JWT_ALGORITHM', 'RS256');
  }

  /**
   * JWT secret for HS256 validation (Supabase default).
   * Used when JWT_ALGORITHM is HS256.
   */
  get jwtSecret(): string | undefined {
    const secret = this.configService.get<string>('JWT_SECRET');
    return secret && secret.length > 0 ? secret : undefined;
  }

  /**
   * JWT public key in PEM format for RS256/ES256 validation.
   * If not provided, JWKS will be used instead.
   */
  get jwtPublicKey(): string | undefined {
    const key = this.configService.get<string>('JWT_PUBLIC_KEY');
    if (!key || key.length === 0) return undefined;

    // Handle base64-encoded keys
    if (!key.includes('-----BEGIN')) {
      const decoded = Buffer.from(key, 'base64').toString('utf-8');
      if (decoded.includes('-----BEGIN')) {
        return decoded;
      }
    }

    return key;
  }

  /**
   * JWKS URI for fetching public keys dynamically.
   * Used when neither JWT_SECRET nor JWT_PUBLIC_KEY is provided.
   * Recommended for production as it supports key rotation.
   */
  get jwtJwksUri(): string | undefined {
    const uri = this.configService.get<string>('JWT_JWKS_URI');
    return uri && uri.length > 0 ? uri : undefined;
  }

  /**
   * Whether to use HS256 with JWT secret (Supabase pattern).
   */
  get useJwtSecret(): boolean {
    return !!this.jwtSecret && this.jwtAlgorithm === 'HS256';
  }

  /**
   * Whether to use JWKS for key retrieval.
   * JWKS is preferred for production as it supports key rotation.
   */
  get useJwks(): boolean {
    return !this.jwtSecret && !this.jwtPublicKey && !!this.jwtJwksUri;
  }

  // ─────────────────────────────────────────────────────────────
  // Internal Admin Console
  // ─────────────────────────────────────────────────────────────

  /**
   * Whether the internal admin console is enabled.
   *
   * WARNING: This is for rare operational interventions only.
   * - Read at startup only (requires restart to change)
   * - Off by default
   * - When disabled, admin routes are not mounted
   */
  get adminConsoleEnabled(): boolean {
    return this.configService.get<boolean>('ADMIN_CONSOLE_ENABLED', false);
  }

  /**
   * List of user IDs (subs) that should have ADMIN_WRITE access.
   *
   * Bootstrap mechanism for granting admin access when identity provider
   * doesn't manage roles yet. Users in this list bypass role checking.
   *
   * Format: Comma-separated list of subs
   * Example: "user-123,user-456,4c6a9628-fbf0-4ad0-8157-7b91f4b2ec8f"
   */
  get adminUserIds(): Set<string> {
    const raw = this.configService.get<string>('ADMIN_USER_IDS', '');
    if (!raw || raw.trim() === '') {
      return new Set();
    }
    return new Set(
      raw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Push Notification Infrastructure
  // ─────────────────────────────────────────────────────────────

  /**
   * Retention period for inactive push tokens (in days).
   * Tokens older than this will be removed during cleanup.
   */
  get pushTokenRetentionDays(): number {
    return this.configService.get<number>('PUSH_TOKEN_RETENTION_DAYS', 90);
  }

  /**
   * Whether push token cleanup is enabled.
   */
  get pushTokenCleanupEnabled(): boolean {
    return this.configService.get<boolean>('PUSH_TOKEN_CLEANUP_ENABLED', true);
  }

  /**
   * Master circuit breaker for push notifications.
   * If false, the adapter must return SKIPPED.
   *
   * Default: false (safe by default)
   */
  get notificationsPushEnabled(): boolean {
    return this.configService.get<boolean>('NOTIFICATIONS_PUSH_ENABLED', false);
  }

  // ─────────────────────────────────────────────────────────────
  // Rate Limiting
  // ─────────────────────────────────────────────────────────────

  get rateLimitDriver(): 'memory' | 'redis' {
    return this.configService.get<'memory' | 'redis'>('RATE_LIMIT_DRIVER', 'memory');
  }

  get rateLimitFallbackEnabled(): boolean {
    return this.configService.get<boolean>('RATE_LIMIT_FALLBACK_ENABLED', true);
  }

  get rateLimitFallbackMemoryTtlSeconds(): number {
    return this.configService.get<number>('RATE_LIMIT_FALLBACK_MEMORY_TTL_SECONDS', 60);
  }

  get rateLimitFallbackMemoryMaxEntries(): number {
    return this.configService.get<number>('RATE_LIMIT_FALLBACK_MEMORY_MAX_ENTRIES', 10000);
  }

  get rateLimitFallbackProbeCooldownMs(): number {
    return this.configService.get<number>('RATE_LIMIT_FALLBACK_PROBE_COOLDOWN_MS', 30000);
  }

  get rateLimitFallbackCleanupIntervalMs(): number {
    return this.configService.get<number>('RATE_LIMIT_FALLBACK_CLEANUP_INTERVAL_MS', 60000);
  }

  // ─────────────────────────────────────────────────────────────
  // In-App Scheduler
  // ─────────────────────────────────────────────────────────────

  /**
   * Whether the in-app scheduler is enabled.
   *
   * When enabled:
   * - Background jobs run on schedules while the app is alive
   * - Uses DB-level locking for multi-instance safety
   *
   * When disabled:
   * - No background jobs run in this process
   * - Use for future Option 7 (dedicated worker process)
   *
   * See docs/canonical/SCHEDULING.md for details.
   */
  get inAppSchedulerEnabled(): boolean {
    return this.configService.get<boolean>('IN_APP_SCHEDULER_ENABLED', false);
  }

  /**
   * Scheduler mode: 'cron' or 'uptime-based'.
   *
   * - CRON (default): Fixed clock-time scheduling using cron expressions.
   *   Jobs run at the same wall-clock time regardless of restarts.
   *
   * - UPTIME_BASED: Interval-based scheduling using setInterval.
   *   ⚠️ Causes schedule drift on restarts - dev/test only!
   */
  get schedulerMode(): SchedulerMode {
    const mode = this.configService.get<string>('SCHEDULER_MODE', 'cron');
    return mode === 'uptime-based' ? SchedulerMode.UPTIME_BASED : SchedulerMode.CRON;
  }

  /**
   * Cron expression for every-minute schedule.
   * Default: "* * * * *" (every minute)
   */
  get schedulerEveryMinuteCron(): string {
    return this.configService.get<string>('SCHEDULER_EVERY_MINUTE_CRON', '* * * * *');
  }

  /**
   * Cron expression for daily maintenance schedule.
   * Default: "0 3 * * *" (daily at 3:00 AM)
   */
  get schedulerDailyCron(): string {
    return this.configService.get<string>('SCHEDULER_DAILY_CRON', '0 3 * * *');
  }

  /**
   * Timezone for cron expressions.
   * Default: "UTC"
   */
  get schedulerTimezone(): string {
    return this.configService.get<string>('SCHEDULER_TIMEZONE', 'UTC');
  }

  // ─────────────────────────────────────────────────────────────
  // Weekly Growth Report
  // ─────────────────────────────────────────────────────────────

  /**
   * Cron expression for the weekly growth report.
   * Default: "0 9 * * 1" (Mondays at 09:00)
   */
  get weeklyGrowthReportCron(): string {
    return this.configService.get<string>('WEEKLY_GROWTH_REPORT_CRON', '0 9 * * 1');
  }

  /**
   * Recipients for the weekly growth report.
   * Format: comma-separated emails.
   */
  get weeklyReportRecipients(): string[] {
    const raw = this.configService.get<string>('WEEKLY_REPORT_RECIPIENTS', '');
    if (!raw || raw.trim() === '') {
      return [];
    }
    return raw
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  // ─────────────────────────────────────────────────────────────
  // Alerts & Monitoring
  // ─────────────────────────────────────────────────────────────

  /**
   * Recipients for the weekly GDPR compliance report.
   * Format: comma-separated emails.
   */
  get gdprReportRecipients(): string[] {
    const raw = this.configService.get<string>('GDPR_REPORT_RECIPIENTS', '');
    if (!raw || raw.trim() === '') {
      return [];
    }
    return raw
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  /**
   * Cron expression for the weekly GDPR compliance report.
   * Default: "0 9 * * 1" (Mondays at 09:00)
   */
  get gdprComplianceReportCron(): string {
    return this.configService.get<string>('WEEKLY_GDPR_COMPLIANCE_REPORT_CRON', '0 9 * * 1');
  }

  // ─────────────────────────────────────────────────────────────
  // Alerts & Monitoring
  // ─────────────────────────────────────────────────────────────

  /**
   * Recipients for backend infrastructure alerts (e.g. Scheduler, Connectivity).
   * Format: comma-separated emails.
   */
  get infraAlertRecipients(): string[] {
    const raw = this.configService.get<string>('INFRA_ALERT_RECIPIENTS', '');
    if (!raw || raw.trim() === '') {
      return [];
    }
    return raw
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  /**
   * Recipients for operational system alerts (e.g. GDPR integrity failures).
   * Format: comma-separated emails.
   */
  get alertEmailRecipients(): string[] {
    const raw = this.configService.get<string>('ALERT_EMAIL_RECIPIENTS', '');
    if (!raw || raw.trim() === '') {
      return [];
    }
    return raw
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  get gdprStuckThresholdMinutes(): number {
    return this.configService.get<number>('GDPR_STUCK_THRESHOLD_MINUTES', 60);
  }

  get gdprIntegrityCron(): string {
    return this.configService.get<string>('GDPR_INTEGRITY_CRON', '0 * * * *');
  }

  // ─────────────────────────────────────────────────────────────
  // Weekly Notification Health Report
  // ─────────────────────────────────────────────────────────────

  /**
   * Cron expression for the weekly notification health report.
   * Default: "0 10 * * 1" (Mondays at 10:00)
   */
  get weeklyNotificationHealthReportCron(): string {
    return this.configService.get<string>('WEEKLY_NOTIFICATION_HEALTH_REPORT_CRON', '0 10 * * 1');
  }

  /**
   * Recipients for the weekly notification health report.
   * Format: comma-separated emails.
   */
  get notificationHealthReportRecipients(): string[] {
    const raw = this.configService.get<string>('NOTIFICATION_HEALTH_REPORT_RECIPIENTS', '');
    if (!raw || raw.trim() === '') {
      return [];
    }
    return raw
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  // ─────────────────────────────────────────────────────────────
  // Weekly Safety & Moderation Report
  // ─────────────────────────────────────────────────────────────

  /**
   * Cron expression for the weekly safety & moderation report.
   * Default: "0 11 * * 1" (Mondays at 11:00)
   */
  get weeklySafetyModerationReportCron(): string {
    return this.configService.get<string>('WEEKLY_SAFETY_MODERATION_REPORT_CRON', '0 11 * * 1');
  }

  /**
   * Recipients for the weekly safety & moderation report.
   * Format: comma-separated emails.
   */
  get safetyModerationReportRecipients(): string[] {
    const raw = this.configService.get<string>('SAFETY_MODERATION_REPORT_RECIPIENTS', '');
    if (!raw || raw.trim() === '') {
      return [];
    }
    return raw
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  }

  // ─────────────────────────────────────────────────────────────
  // External Site Availability Monitor
  // ─────────────────────────────────────────────────────────────

  /**
   * Target URLs to monitor for availability.
   * Format: comma-separated URLs.
   * Invalid URLs are logged as WARN and skipped.
   */
  get siteMonitorTargets(): string[] {
    const raw = this.configService.get<string>('SITE_MONITOR_TARGETS', '');
    if (!raw || raw.trim() === '') {
      return [];
    }
    const targets: string[] = [];
    const rawUrls = raw
      .split(',')
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    for (const url of rawUrls) {
      try {
        new URL(url);
        targets.push(url);
      } catch {
        // eslint-disable-next-line no-console
        console.warn(`Skipping invalid SITE_MONITOR_TARGET: '${url}'`);
      }
    }
    return targets;
  }

  /**
   * Expected HTTP status code for site checks.
   * Default: 200
   */
  get siteMonitorExpectedStatus(): number {
    return this.configService.get<number>('SITE_MONITOR_EXPECTED_STATUS', 200);
  }

  /**
   * Timeout for each site check request (in milliseconds).
   * Default: 5000ms
   */
  get siteMonitorTimeoutMs(): number {
    return this.configService.get<number>('SITE_MONITOR_TIMEOUT_MS', 5000);
  }

  /**
   * Cron expression for site monitor check frequency.
   * Default: every 5 minutes
   */
  get siteMonitorCheckCron(): string {
    return this.configService.get<string>('SITE_MONITOR_CHECK_CRON', '*/5 * * * *');
  }
}
