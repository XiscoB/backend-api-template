/**
 * Public Bootstrap Module
 *
 * Provides public, unauthenticated app-level bootstrap endpoint.
 *
 * Endpoint:
 * - GET /api/v1/public/bootstrap - Client bootstrap configuration (PUBLIC)
 *
 * This module exposes NON-SECRET, version-controlled runtime configuration.
 * Response is cacheable and identical for all callers.
 *
 * It MUST NOT:
 * - Inspect JWTs
 * - Return user or identity data
 * - Perform suspension checks
 * - Expose environment secrets
 * - Expose GDPR internals
 * - Expose batch sizes / scheduler config
 * - Expose database-backed flags
 *
 * @see src/config/app.constants.ts - Internal source of truth
 * @see src/modules/app/v1/dto/app-bootstrap.dto.ts - Public contract
 */

import { Module } from '@nestjs/common';
import { AppController } from './v1/app.controller';
import { AppBootstrapService } from './app-bootstrap.service';

@Module({
  controllers: [AppController],
  providers: [AppBootstrapService],
  exports: [AppBootstrapService],
})
export class AppModule {}
