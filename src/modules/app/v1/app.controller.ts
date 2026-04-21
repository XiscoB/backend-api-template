/**
 * Public Bootstrap Controller (v1)
 *
 * Provides public, unauthenticated app-level bootstrap endpoint.
 *
 * Endpoint:
 * - GET /api/v1/public/bootstrap - Client bootstrap configuration (PUBLIC)
 *
 * All endpoints are public (no authentication required).
 * Response is cacheable and identical for all callers.
 *
 * IMPORTANT:
 * - This endpoint MUST NOT inspect JWTs
 * - This endpoint MUST NOT return user or identity data
 * - This endpoint MUST NOT perform suspension checks
 *
 * Rate limit: rl-public-flexible (300 req / 60s)
 * @see RATE_LIMIT_TIERS for tier definitions
 */

import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../../../common/decorators/public.decorator';
// import { RATE_LIMIT_TIERS } from '../../../config/rate-limit.config';
import { AppBootstrapService } from '../app-bootstrap.service';
import { AppBootstrapResponseDto } from './dto/app-bootstrap.dto';

@Controller('v1/public')
export class AppController {
  /*
   * Rate limit tier for app endpoints.
   * Exposed for rate limiter configuration.
   */
  // static readonly RATE_LIMIT_TIER = 'rl-public-flexible' as const;

  constructor(private readonly bootstrapService: AppBootstrapService) {}

  /**
   * Get public app bootstrap configuration.
   *
   * Returns the complete configuration needed for client initialization:
   * - Update policies (per platform)
   * - App metadata (version, branding)
   * - Feature flags (system-level, not per-user)
   * - i18n settings
   *
   * CHARACTERISTICS:
   * - Public (no authentication required)
   * - Cacheable (same response for all callers)
   * - No identity or user-related data
   *
   * CACHING GUIDANCE:
   * - Client may cache for up to 1 hour
   * - Must refresh on app foreground after background
   * - Must refresh on app launch
   * - Cache-Control header set to public, max-age=3600
   *
   * @example GET /api/v1/public/bootstrap
   *
   * @returns {AppBootstrapResponseDto} Bootstrap configuration
   */
  @Public()
  @Get('bootstrap')
  @Header('Cache-Control', 'public, max-age=3600')
  getBootstrap(): AppBootstrapResponseDto {
    return this.bootstrapService.getBootstrapConfig();
  }
}
