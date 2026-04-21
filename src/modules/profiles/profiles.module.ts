import { Module, forwardRef } from '@nestjs/common';
import { ProfilesController } from './v1/profiles.controller';
import { ProfilesService } from './profiles.service';
import { ProfilesRepository } from './profiles.repository';
import { IdentityModule } from '../identity/identity.module';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * Profiles module.
 *
 * Manages application-level profile data linked to Identity.
 * This module demonstrates the standard pattern for domain modules:
 * - Controller handles HTTP concerns only
 * - Service owns business logic
 * - Repository abstracts database access
 *
 * Ownership flows through Identity (not externalUserId).
 *
 * IMPORTANT: Profile creation also ensures a notification profile exists.
 * This guarantees every user has notification delivery capability.
 */
@Module({
  imports: [IdentityModule, forwardRef(() => NotificationsModule)],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfilesRepository],
  exports: [ProfilesService, ProfilesRepository],
})
export class ProfilesModule {}
