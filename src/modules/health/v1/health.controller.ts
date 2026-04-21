import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipResponseWrap } from '../../../common/decorators/skip-response-wrap.decorator';
import { RateLimit } from '../../../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../../../common/guards/rate-limit.guard';
import { HealthService } from '../health.service';
import { HealthResponseDto } from './dto/health-response.dto';

/**
 * Health controller (v1).
 *
 * Provides health check endpoints for monitoring systems.
 * All endpoints are public (no authentication required).
 * Health endpoints skip the standard response envelope for simplicity.
 *
 * Rate limit example: The /detailed endpoint demonstrates rate limiting
 * on a public endpoint using rl-public-flexible tier.
 */
@Controller('v1/health')
@SkipResponseWrap()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Basic health check.
   *
   * Returns { status: "ok" } if the service is running.
   * Use this for simple liveness probes.
   *
   * Note: No rate limiting on basic health (used by load balancers).
   *
   * @example GET /api/v1/health
   */
  @Public()
  @Get()
  getHealth(): { status: string } {
    return this.healthService.getLiveness();
  }

  /**
   * Detailed health check.
   *
   * Returns the health status of all components (database, etc.)
   * Use this for readiness probes and monitoring dashboards.
   *
   * Rate limited: rl-public-flexible (300 req / 60s per IP)
   * This is an EXAMPLE of rate limiting on a public endpoint.
   *
   * @example GET /api/v1/health/detailed
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit('rl-public-flexible')
  @Get('detailed')
  async getDetailedHealth(): Promise<HealthResponseDto> {
    return await this.healthService.checkHealth();
  }
}
