import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './common/auth/auth.module';
import { AuditModule } from './common/audit/audit.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { IdentityStatusGuard } from './common/guards/identity-status.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HealthModule } from './modules/health/health.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { IdentityModule } from './modules/identity/identity.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReportsModule } from './modules/reports/reports.module';
import { InternalAdminModule } from './modules/internal-admin/internal-admin.module';
import { SchedulerModule } from './infrastructure/scheduler/scheduler.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AppModule as PublicBootstrapModule } from './modules/app/app.module';
import { BootstrapModule } from './modules/bootstrap/bootstrap.module';
import { RateLimitModule } from './common/rate-limit';

/**
 * Root application module.
 *
 * Architecture notes:
 * - ConfigModule is global and loaded first
 * - PrismaModule provides database access
 * - AuthModule handles JWT validation (not issuance)
 * - JwtAuthGuard is applied globally; use @Public() to skip auth
 * - IdentityStatusGuard blocks BANNED/DELETED/PENDING_DELETION users
 * - Feature modules are imported from ./modules
 * - Internal Admin Console is conditionally loaded based on ADMIN_CONSOLE_ENABLED
 *
 * RolesGuard is applied globally after authentication and identity checks.
 */
@Module({
  imports: [
    // Configuration (global, validates env vars at startup)
    AppConfigModule,

    // Database (Prisma client)
    PrismaModule,

    // Authentication (JWT validation only)
    AuthModule,

    // Audit logging (global)
    AuditModule,

    // Identity module (required for IdentityStatusGuard)
    IdentityModule,

    // Feature modules

    ProfilesModule,

    // Public bootstrap (client initialization config - unauthenticated)
    PublicBootstrapModule,

    // Authenticated bootstrap (user startup context - authenticated)
    BootstrapModule,

    // GDPR compliance (export, audit logging, enforcement)
    GdprModule,

    // Notification infrastructure (in-app notifications, scheduling)
    NotificationsModule,

    // Reports & Moderation (user reporting, content moderation)
    ReportsModule,

    // Internal Admin Console (conditionally loaded)
    // Only imported when ADMIN_CONSOLE_ENABLED=true
    ...(process.env.ADMIN_CONSOLE_ENABLED === 'true' ? [InternalAdminModule] : []),

    // Redis Infrastructure (conditionally loaded)
    // Only imported when RATE_LIMIT_DRIVER=redis
    ...(process.env.RATE_LIMIT_DRIVER === 'redis' ? [RedisModule] : []),

    // Rate limiting infrastructure (opt-in, per-controller)
    // Use @UseGuards(RateLimitGuard) + @RateLimit('tier-name')
    RateLimitModule,

    // Feature modules
    HealthModule,

    // In-App Scheduler (Option 1)
    // Only starts scheduling when IN_APP_SCHEDULER_ENABLED=true
    // Only ONE replica should have this enabled
    // See docs/canonical/SCHEDULING.md
    SchedulerModule,
  ],
  providers: [
    // Global JWT guard: All routes require auth by default
    // Use @Public() decorator to make routes public
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Global identity status guard: Blocks BANNED/DELETED/PENDING_DELETION users
    // Runs after JWT guard - requires valid JWT first
    // Use @AllowSuspended() to allow suspended users on specific endpoints
    {
      provide: APP_GUARD,
      useClass: IdentityStatusGuard,
    },
    // Global roles guard: Enforces elevated role requirements from decorator metadata
    // Routes without elevated role requirements allow baseline authenticated access
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
