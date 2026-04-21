/**
 * Delivery Infrastructure
 *
 * Shared infrastructure for sending reports and alerts.
 *
 * Guarantees:
 * - Missing recipients never crash jobs
 * - Delivery failures never block schedulers
 * - Consistent formatting across all emails
 *
 * @example
 * import { DeliveryModule, AlertDeliveryService, RecipientGroup } from '../infrastructure/delivery';
 *
 * // In your job:
 * await alertDeliveryService.sendAlert({
 *   recipientGroup: RecipientGroup.INFRA_ALERTS,
 *   severity: 'CRITICAL',
 *   title: 'Job Not Running',
 *   htmlBody: '<h1>Alert</h1><p>Details...</p>',
 * });
 */

// Module
export { DeliveryModule } from './delivery.module';

// Services
export { RecipientGroupService } from './recipient-group.service';
export { AlertDeliveryService } from './alert-delivery.service';
export { ReportDeliveryService } from './report-delivery.service';

// Utilities
export { EmailFormatUtils } from './email-format.utils';

// Types
export {
  RecipientGroup,
  AlertSeverity,
  AlertDeliveryResult,
  ReportDeliveryResult,
} from './delivery.types';
