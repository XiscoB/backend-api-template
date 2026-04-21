import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { RecipientGroupService } from './recipient-group.service';
import { EmailFormatUtils } from './email-format.utils';
import { RecipientGroup, AlertSeverity, AlertDeliveryResult } from './delivery.types';

/**
 * Alert Delivery Service
 *
 * Single entry point for sending alert emails.
 *
 * Guarantees:
 * - Never throws (fail-safe)
 * - Missing recipients → WARN log, returns { sent: false }
 * - Email failure → ERROR log, returns { sent: false }
 *
 * Rate-limiting is NOT handled here - that remains in the job layer.
 */
@Injectable()
export class AlertDeliveryService {
  private readonly logger = new Logger(AlertDeliveryService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly recipientGroupService: RecipientGroupService,
  ) {}

  /**
   * Send an alert email.
   *
   * @param options.recipientGroup - Target recipient group
   * @param options.severity - Alert severity (CRITICAL, WARNING, INFO)
   * @param options.title - Alert title (appears in subject)
   * @param options.htmlBody - Pre-formatted HTML body
   * @returns Result with sent status and optional skip reason
   */
  async sendAlert(options: {
    recipientGroup: RecipientGroup;
    severity: AlertSeverity;
    title: string;
    htmlBody: string;
  }): Promise<AlertDeliveryResult> {
    const { recipientGroup, severity, title, htmlBody } = options;

    // 1. Resolve recipients
    const recipients = this.recipientGroupService.resolveGroup(recipientGroup);

    if (recipients.length === 0) {
      this.logger.warn({
        message: 'Alert skipped: no recipients configured',
        recipientGroup,
        severity,
        title,
      });
      return { sent: false, skippedReason: 'no_recipients' };
    }

    // 2. Format subject
    const subject = EmailFormatUtils.alertSubject(severity, title);

    // 3. Add footer
    const fullHtml = EmailFormatUtils.wrapContent(htmlBody, new Date());

    // 4. Send email (fail-safe)
    try {
      await this.emailService.send({
        recipients: recipients.map((email) => ({ email })),
        rawSubject: subject,
        rawHtml: fullHtml,
        from: 'system-alerts@backend-base.internal',
        fromName: 'Backend Alerts',
      });

      this.logger.log({
        message: 'Alert sent successfully',
        recipientGroup,
        severity,
        title,
        recipientCount: recipients.length,
      });

      return { sent: true, recipientCount: recipients.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({
        message: 'Failed to send alert email',
        recipientGroup,
        severity,
        title,
        error: errorMessage,
      });
      return { sent: false, skippedReason: 'email_failed' };
    }
  }
}
