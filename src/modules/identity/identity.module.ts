import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { IdentityService } from './identity.service';
import { IdentityRepository } from './identity.repository';

/**
 * Identity Module
 *
 * Provides the canonical Identity resolution layer.
 * All person-owned data flows through Identity.
 *
 * Key responsibilities:
 * - Lazy Identity creation from JWT sub
 * - Identity lookup by externalUserId
 * - Identity status management (suspension, anonymization)
 *
 * @see docs/create_tables_guideline.md
 * @see agents.md Section 8: Identity & Ownership Model
 */
@Module({
  imports: [PrismaModule],
  providers: [IdentityService, IdentityRepository],
  exports: [IdentityService, IdentityRepository],
})
export class IdentityModule {}
