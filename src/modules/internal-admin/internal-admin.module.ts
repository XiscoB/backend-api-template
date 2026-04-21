import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InternalAdminController } from './internal-admin.controller';
import { InternalAdminService } from './internal-admin.service';
import { GdprCoverageService } from './gdpr-coverage.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthModule } from '../../common/auth/auth.module';
import { AppConfigModule } from '../../config/app-config.module';
import { CleanupModule } from '../../infrastructure/cleanup';
import { INTERNAL_ADMIN_CONFIG } from './internal-admin.config';

/**
 * Internal Admin Module.
 *
 * Provides a controlled admin console for rare operational interventions.
 *
 * Security constraints:
 * - Environment-gated (ADMIN_CONSOLE_ENABLED=true required)
 * - Mounted under /internal/admin (separate from public APIs)
 * - Requires ADMIN_READ or ADMIN_WRITE privilege in JWT
 * - Hardcoded table allowlists (no dynamic discovery)
 * - No bulk operations, no deletes
 *
 * WARNING: This module should only be imported when ADMIN_CONSOLE_ENABLED=true.
 * The conditional import is handled in AppModule.
 */
@Module({
  imports: [AppConfigModule, ConfigModule, AuthModule, PrismaModule, CleanupModule],
  controllers: [InternalAdminController],
  providers: [
    InternalAdminService,
    GdprCoverageService,
    // Admin privilege guard is applied at controller level, not globally
  ],
})
export class InternalAdminModule implements OnModuleInit {
  private readonly logger = new Logger(InternalAdminModule.name);

  onModuleInit(): void {
    const config = INTERNAL_ADMIN_CONFIG;

    this.logger.warn('');
    this.logger.warn('╔══════════════════════════════════════════════════════════════╗');
    this.logger.warn('║  ⚠️  INTERNAL ADMIN CONSOLE ENABLED                           ║');
    this.logger.warn('║                                                              ║');
    this.logger.warn('║  This is for rare operational interventions only.            ║');
    this.logger.warn('║  Disable in production unless absolutely necessary.          ║');
    this.logger.warn('╚══════════════════════════════════════════════════════════════╝');
    this.logger.warn('');
    this.logger.log(`Admin console mounted at: /${config.mounting.basePath}`);
    this.logger.log(`Visible tables: ${config.tables.visible.join(', ')}`);
    this.logger.log(`Writable tables: ${config.tables.writable.join(', ')}`);
    this.logger.log(
      `Rate limit tier: ${config.rateLimit.tier} (${config.rateLimit.limit} req/${config.rateLimit.windowSeconds}s)`,
    );
  }
}
