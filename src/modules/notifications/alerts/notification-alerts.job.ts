import { Injectable, Logger } from '@nestjs/common';
import { NotificationAlertsService } from './notification-alerts.service';
import { AlertDeliveryService, RecipientGroup } from '../../../infrastructure/delivery';

/**
 * Notification Alerts Job
 *
 * Checks for notification delivery anomalies and sends alerts.
 * Uses AlertDeliveryService for centralized, fail-safe delivery.
 *
 * Designed to be called by an external scheduler (e.g. cron).
 */
@Injectable()
export class NotificationAlertsJob {
  private readonly logger = new Logger(NotificationAlertsJob.name);

  constructor(
    private readonly alertsService: NotificationAlertsService,
    private readonly alertDeliveryService: AlertDeliveryService,
  ) {}

  /**
   * Run the alert checks and send emails if necessary.
   * Never throws (fail-safe).
   */
  async checkAndAlert(): Promise<void> {
    this.logger.log('Starting execution of NotificationAlertsJob...');

    try {
      const { alerts } = await this.alertsService.runChecks();

      if (alerts.length === 0) {
        this.logger.log('No notification anomalies detected.');
        return;
      }

      this.logger.warn(`Detected ${alerts.length} notification alerts. Sending email...`);

      // Format email body
      const alertList = alerts
        .map(
          (a) =>
            `<strong>[${a.severity}] ${a.title}</strong><br/>${a.description}<br/><pre>${JSON.stringify(
              a.metadata,
              null,
              2,
            )}</pre>`,
        )
        .join('<hr/>');

      const htmlBody = `
        <h2>Notification Delivery Issues Detected</h2>
        <p>The following ${alerts.length} issue(s) were detected:</p>
        ${alertList}
      `;

      // Send via AlertDeliveryService
      const result = await this.alertDeliveryService.sendAlert({
        recipientGroup: RecipientGroup.INFRA_ALERTS,
        severity: 'WARNING',
        title: `${alerts.length} Notification Alert(s) Detected`,
        htmlBody,
      });

      if (result.sent) {
        this.logger.log('Alert email sent successfully.');
      } else if (result.skippedReason === 'no_recipients') {
        this.logger.warn('Alert skipped: no INFRA_ALERT_RECIPIENTS configured.');
      }
    } catch (error) {
      this.logger.error(
        `Failed to run NotificationAlertsJob: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Do not rethrow - we don't want to crash the scheduler, just log the error
    }
  }
}
