import { Module } from '@nestjs/common';
import { WhoamiController } from './whoami.controller';

/**
 * Whoami Module - Minimal Example
 *
 * Wiring demonstration only.
 * No services, no providers, no business logic.
 *
 * This module registers a single controller that returns
 * the authenticated identity context. Authentication and
 * identity resolution are handled by global guards.
 *
 * To integrate this example:
 *   Import WhoamiModule in AppModule.imports[]
 *
 * Global guards (applied automatically):
 *   1. JwtAuthGuard - Validates JWT signature and claims
 *   2. IdentityStatusGuard - Enforces identity status (banned, deleted, etc.)
 */
@Module({
  controllers: [WhoamiController],
})
export class WhoamiModule {}
