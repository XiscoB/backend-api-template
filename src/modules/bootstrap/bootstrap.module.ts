/**
 * Bootstrap Module
 *
 * Provides authenticated user bootstrap endpoint.
 *
 * Endpoint:
 * - POST /api/v1/bootstrap - Authenticated user startup context
 *
 * This module handles authenticated bootstrap, which is the MANDATORY
 * first call after login. It resolves identity, checks status, and
 * returns minimal user context.
 *
 * SEPARATION OF CONCERNS:
 * - Public bootstrap (GET /api/v1/public/bootstrap) → App-level config
 * - Authenticated bootstrap (POST /api/v1/bootstrap) → User-level context
 *
 * @see docs/canonical/AUTH_CONTRACT.md
 */

import { Module } from '@nestjs/common';
import { BootstrapController } from './v1/bootstrap.controller';
import { BootstrapService } from './bootstrap.service';
import { IdentityModule } from '../identity/identity.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { GdprModule } from '../gdpr/gdpr.module';

@Module({
  imports: [
    // For identity resolution
    IdentityModule,
    // For profile lookup
    ProfilesModule,
    // For recovery availability check
    GdprModule,
  ],
  controllers: [BootstrapController],
  providers: [BootstrapService],
  exports: [BootstrapService],
})
export class BootstrapModule {}
