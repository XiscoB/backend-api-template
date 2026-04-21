import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { CleanupRegistry } from './cleanup.registry';
import { CleanupCronService } from './cleanup-cron.service';
import { AuditLogCleanupService } from './audit-log.cleanup';
import { NotificationDeliveryCleanupService } from './notification-delivery.cleanup';
import { PushTokenCleanupService } from './push-token.cleanup';

/**
 * Infrastructure Cleanup Module
 *
 * Provides baseline cleanup jobs for infrastructure tables.
 * All cleanup jobs are hygiene-only and do not affect domain logic.
 *
 * Registered cleanups:
 * - audit-log-cleanup: Removes old GdprAuditLog records
 * - notification-delivery-cleanup: Removes old delivery logs
 * - push-token-cleanup: Removes inactive push tokens
 *
 * All cleanups are:
 * - Environment-gated (disabled by default)
 * - Time-based only
 * - Idempotent
 * - Independent (no execution order)
 *
 * Usage:
 * - Import this module in app.module.ts
 * - Call CleanupCronService.runAllCleanups() from your scheduler
 * - Or call individual cleanups via CleanupCronService.runCleanup(name)
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  providers: [
    CleanupRegistry,
    CleanupCronService,
    AuditLogCleanupService,
    NotificationDeliveryCleanupService,
    PushTokenCleanupService,
  ],
  exports: [CleanupCronService],
})
export class CleanupModule implements OnModuleInit {
  constructor(
    private readonly registry: CleanupRegistry,
    private readonly auditLogCleanup: AuditLogCleanupService,
    private readonly notificationDeliveryCleanup: NotificationDeliveryCleanupService,
    private readonly pushTokenCleanup: PushTokenCleanupService,
  ) {}

  /**
   * Register all cleanup jobs on module initialization.
   * This ensures all cleanup jobs are available when the module is loaded.
   */
  onModuleInit(): void {
    this.registry.register(this.auditLogCleanup);
    this.registry.register(this.notificationDeliveryCleanup);
    this.registry.register(this.pushTokenCleanup);
  }
}
