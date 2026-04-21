import { Module } from '@nestjs/common';
import { HealthController } from './v1/health.controller';
import { HealthService } from './health.service';
import { IdentityModule } from '../identity/identity.module';

/**
 * Health module.
 *
 * Provides health check endpoints for monitoring and orchestration.
 */
@Module({
  imports: [IdentityModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
