import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from '../email/email.module';
import { RecipientGroupService } from './recipient-group.service';
import { AlertDeliveryService } from './alert-delivery.service';
import { ReportDeliveryService } from './report-delivery.service';

/**
 * Delivery Module
 *
 * Provides shared infrastructure for sending reports and alerts.
 *
 * Services:
 * - RecipientGroupService: Resolves env-based recipient groups
 * - AlertDeliveryService: Fail-safe alert email delivery
 * - ReportDeliveryService: Fail-safe report email delivery
 *
 * Usage:
 * Import this module in any module that needs to send alerts or reports.
 *
 * @example
 * @Module({
 *   imports: [DeliveryModule],
 *   providers: [SchedulerAlertsJob],
 * })
 * export class SchedulerModule {}
 */
@Module({
  imports: [ConfigModule, EmailModule.forRoot()],
  providers: [RecipientGroupService, AlertDeliveryService, ReportDeliveryService],
  exports: [RecipientGroupService, AlertDeliveryService, ReportDeliveryService],
})
export class DeliveryModule {}
