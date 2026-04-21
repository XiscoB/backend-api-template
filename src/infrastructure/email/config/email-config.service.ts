import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Email configuration service.
 *
 * Provides typed access to email-related environment variables.
 * All email provider configuration is environment-driven.
 *
 * Design principles:
 * - Provider-agnostic configuration
 * - Optional providers (no required credentials in development)
 * - Fail-fast validation in production
 */
@Injectable()
export class EmailConfigService {
  constructor(private readonly configService: ConfigService) {}

  // ─────────────────────────────────────────────────────────────
  // General Email Configuration
  // ─────────────────────────────────────────────────────────────

  /**
   * Active email provider.
   * Options: 'sparkpost', 'ses', 'console'
   * Default: 'console' (development-friendly)
   */
  get provider(): 'sparkpost' | 'ses' | 'console' {
    const provider = this.configService.get<string>('EMAIL_PROVIDER', 'console');
    if (provider === 'sparkpost' || provider === 'ses' || provider === 'console') {
      return provider;
    }
    return 'console';
  }

  /**
   * Default sender email address.
   * Must be verified with the email provider.
   */
  get defaultFrom(): string {
    return this.configService.get<string>('EMAIL_DEFAULT_FROM', 'noreply@example.com');
  }

  /**
   * Default sender display name.
   */
  get defaultFromName(): string | undefined {
    return this.configService.get<string>('EMAIL_DEFAULT_FROM_NAME');
  }

  /**
   * Product name for email templates.
   */
  get productName(): string {
    return this.configService.get<string>('EMAIL_PRODUCT_NAME', this.defaultFromName ?? 'My App');
  }

  /**
   * Product logo URL for email templates.
   */
  get productLogoUrl(): string {
    return this.configService.get<string>('EMAIL_PRODUCT_LOGO_URL', '');
  }

  /**
   * Support email for footer.
   */
  get supportEmail(): string {
    return this.configService.get<string>('EMAIL_SUPPORT_EMAIL', this.defaultFrom ?? '');
  }

  /**
   * Whether email sending is enabled.
   * Set to false to disable all email sending (e.g., in tests).
   */
  get enabled(): boolean {
    return this.configService.get<boolean>('EMAIL_ENABLED', true);
  }

  // ─────────────────────────────────────────────────────────────
  // SparkPost Configuration
  // ─────────────────────────────────────────────────────────────

  /**
   * SparkPost API key.
   */
  get sparkpostApiKey(): string {
    return this.configService.get<string>('SPARKPOST_API_KEY', '');
  }

  /**
   * SparkPost API endpoint.
   * EU accounts: https://api.eu.sparkpost.com/api/v1
   * US accounts: https://api.sparkpost.com/api/v1
   */
  get sparkpostApiEndpoint(): string {
    return this.configService.get<string>(
      'SPARKPOST_API_ENDPOINT',
      'https://api.sparkpost.com/api/v1',
    );
  }

  /**
   * Check if SparkPost is properly configured.
   */
  get isSparkpostConfigured(): boolean {
    return !!this.sparkpostApiKey;
  }

  // ─────────────────────────────────────────────────────────────
  // Amazon SES Configuration
  // ─────────────────────────────────────────────────────────────

  /**
   * AWS SES region.
   */
  get sesRegion(): string | undefined {
    return this.configService.get<string>('AWS_SES_REGION');
  }

  /**
   * AWS access key ID for SES.
   */
  get sesAccessKeyId(): string | undefined {
    return this.configService.get<string>('AWS_SES_ACCESS_KEY_ID');
  }

  /**
   * AWS secret access key for SES.
   */
  get sesSecretAccessKey(): string | undefined {
    return this.configService.get<string>('AWS_SES_SECRET_ACCESS_KEY');
  }

  /**
   * Check if SES is properly configured.
   */
  get isSesConfigured(): boolean {
    return !!(this.sesRegion && this.sesAccessKeyId && this.sesSecretAccessKey);
  }
}
