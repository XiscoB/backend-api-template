import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailService } from '../../infrastructure/email/email.service';

/**
 * Email Confirmation Metadata for GDPR deletion.
 */
export interface DeletionConfirmationMetadata {
  identityId: string;
  anonymizedAt: Date;
  language?: string;
}

export interface DeletionConfirmationEligibility {
  canSend: boolean;
  email?: string;
  reason?: string;
}

/**
 * Email Notification Service (Application Layer).
 *
 * Handles business logic for sending specific types of emails.
 * Enforces permissions, resolving languages, and formatting content.
 */
@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // Authentication Emails
  // ─────────────────────────────────────────────────────────────

  /**
   * Send email verification link.
   */
  async sendVerificationEmail(to: string, link: string, userLanguage = 'en'): Promise<void> {
    if (!this.canSendUserEmails) return;

    await this.safeSend({
      to,
      templateKey: 'verify-email',
      locale: this.resolveLanguage(userLanguage),
      variables: {
        link,
        expiry: '24 hours', // TODO: Make dynamic if needed
      },
      logType: 'Verification',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // GDPR - Data Export
  // ─────────────────────────────────────────────────────────────

  /**
   * Send GDPR data export ready notification.
   */
  async sendGdprExportReady(
    to: string,
    downloadUrl: string,
    expiryDays: number,
    expiryDate: Date,
    userLanguage = 'en',
  ): Promise<void> {
    if (!this.canSendUserEmails) return;

    await this.safeSend({
      to,
      templateKey: 'gdpr-export-ready',
      locale: this.resolveLanguage(userLanguage),
      variables: {
        downloadUrl,
        expiryDays: expiryDays.toString(),
        expiryDate: expiryDate.toLocaleDateString(this.resolveLanguage(userLanguage)),
      },
      logType: 'GDPR Export Ready',
    });
  }

  /**
   * Send GDPR data export failed notification.
   */
  async sendGdprExportFailed(to: string, userLanguage = 'en'): Promise<void> {
    if (!this.canSendUserEmails) return;

    await this.safeSend({
      to,
      templateKey: 'gdpr-export-failed',
      locale: this.resolveLanguage(userLanguage),
      variables: {},
      logType: 'GDPR Export Failed',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Account Status Emails
  // ─────────────────────────────────────────────────────────────

  /**
   * Send account suspension notification.
   */
  async sendAccountSuspensionEmail(
    to: string,
    reason: string,
    date: Date,
    userLanguage = 'en',
  ): Promise<void> {
    // System notifications usually bypass user preferences,
    // but we still respect the global kill-switch.
    if (!this.configService.get('EMAIL_ENABLED', true)) return;

    await this.safeSend({
      to,
      templateKey: 'account-suspended',
      locale: this.resolveLanguage(userLanguage),
      variables: {
        reason,
        date: date.toLocaleDateString(this.resolveLanguage(userLanguage)),
      },
      logType: 'Account Suspension',
    });
  }

  // ─────────────────────────────────────────────────────────────
  // GDPR Emails
  // ─────────────────────────────────────────────────────────────

  /**
   * Send account deletion confirmation.
   * Defined by GDPR requirements.
   */
  async sendAccountDeletionConfirmation(
    email: string,
    metadata: DeletionConfirmationMetadata,
  ): Promise<void> {
    // This is a legal requirement, so it might bypass some checks,
    // but purely for safety we respect the master switch.
    if (!this.configService.get('EMAIL_ENABLED', true)) return;

    const locale = this.resolveLanguage(metadata.language);

    await this.safeSend({
      to: email,
      templateKey: 'gdpr-deletion-confirmation',
      locale,
      variables: {}, // No variables needed for this template
      logType: 'Deletion Confirmation',
    });
  }

  /**
   * Check eligibility for deletion confirmation.
   * Kept for GDPR module compatibility.
   */
  async canReceiveDeletionConfirmation(
    identityId: string,
  ): Promise<DeletionConfirmationEligibility> {
    try {
      const profile = await this.prisma.userNotificationProfile.findUnique({
        where: { identityId },
        include: {
          emailChannels: {
            where: { enabled: true },
            take: 1,
          },
        },
      });

      if (!profile) return { canSend: false, reason: 'No profile' };
      if (!profile.notificationsEnabled)
        return { canSend: false, reason: 'Notifications disabled' };

      const channel = profile.emailChannels[0];
      if (!channel) return { canSend: false, reason: 'No email channel' };

      return { canSend: true, email: channel.email };
    } catch (error) {
      this.logger.warn(
        `Eligibility check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { canSend: false, reason: 'Error checking eligibility' };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Global switch for user-triggered emails.
   */
  private get canSendUserEmails(): boolean {
    // Default to true if not set
    return this.configService.get<boolean>('EMAIL_ALLOW_USER_EMAILS', true);
  }

  /**
   * Resolve language safely.
   */
  private resolveLanguage(lang?: string): string {
    if (!lang) return 'en';
    // Logic to validate supported languages could go here
    // For now, valid ISO codes are passed through, resolved by infrastructure
    return lang;
  }

  /**
   * Safe send wrapper to prevent throwing errors.
   */
  private async safeSend(options: {
    to: string;
    templateKey: string;
    locale: string;
    variables: Record<string, string>;
    logType: string;
  }): Promise<void> {
    try {
      const start = Date.now();
      const result = await this.emailService.send({
        from: this.configService.get('EMAIL_DEFAULT_FROM', 'noreply@example.com'),
        templateKey: options.templateKey,
        locale: options.locale,
        variables: options.variables,
        recipients: [{ email: options.to }],
      });

      this.logger.log(
        `Sent ${options.logType} email to ${this.maskEmail(options.to)} (${Date.now() - start}ms, status: ${result.acceptedCount > 0 ? 'OK' : 'Rejected'})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send ${options.logType} email to ${this.maskEmail(options.to)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // We explicitly swallow the error to not crash the caller
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***@***';
    return `${local[0]}***@${domain}`;
  }
}
