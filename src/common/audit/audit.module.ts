import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';

/**
 * Audit Module.
 *
 * Provides append-only audit logging for administrative actions.
 * Global module - available throughout the application.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
