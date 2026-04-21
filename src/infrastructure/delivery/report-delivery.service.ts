import { Injectable, Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { RecipientGroupService } from './recipient-group.service';
import { EmailFormatUtils } from './email-format.utils';
import { RecipientGroup, ReportDeliveryResult } from './delivery.types';

/**
 * Report Delivery Service
 *
 * Single entry point for sending report emails.
 *
 * Guarantees:
 * - Never throws (fail-safe)
 * - Missing recipients → WARN log, returns { sent: false }
 * - Email failure → ERROR log, returns { sent: false }
 *
 * Note: Most reports currently go through AdminEmailHook via the notification
 * system. This service is available for future reports or direct use cases.
 */
@Injectable()
export class ReportDeliveryService {
  private readonly logger = new Logger(ReportDeliveryService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly recipientGroupService: RecipientGroupService,
  ) {}

  /**
   * Send a report email.
   *
   * @param options.recipientGroup - Target recipient group
   * @param options.reportType - Report type (appears in subject)
   * @param options.periodStart - Report period start date
   * @param options.periodEnd - Report period end date
   * @param options.htmlBody - Pre-formatted HTML body
   * @returns Result with sent status and optional skip reason
   */
  async sendReport(options: {
    recipientGroup: RecipientGroup;
    reportType: string;
    periodStart: Date;
    periodEnd: Date;
    htmlBody: string;
  }): Promise<ReportDeliveryResult> {
    const { recipientGroup, reportType, periodStart, htmlBody } = options;

    // 1. Resolve recipients
    const recipients = this.recipientGroupService.resolveGroup(recipientGroup);

    if (recipients.length === 0) {
      this.logger.warn({
        message: 'Report skipped: no recipients configured',
        recipientGroup,
        reportType,
      });
      return { sent: false, skippedReason: 'no_recipients' };
    }

    // 2. Format subject
    const subject = EmailFormatUtils.reportSubject(reportType, periodStart);

    // 3. Add footer
    const fullHtml = EmailFormatUtils.wrapContent(htmlBody, new Date());

    // 4. Send email (fail-safe)
    try {
      await this.emailService.send({
        recipients: recipients.map((email) => ({ email })),
        rawSubject: subject,
        rawHtml: fullHtml,
        from: 'reports@backend-base.internal',
        fromName: 'Backend Reports',
      });

      this.logger.log({
        message: 'Report sent successfully',
        recipientGroup,
        reportType,
        recipientCount: recipients.length,
      });

      return { sent: true, recipientCount: recipients.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({
        message: 'Failed to send report email',
        recipientGroup,
        reportType,
        error: errorMessage,
      });
      return { sent: false, skippedReason: 'email_failed' };
    }
  }
}
