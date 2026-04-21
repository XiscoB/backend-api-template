/**
 * Bootstrap Controller (v1)
 *
 * Provides authenticated user bootstrap endpoint.
 *
 * Endpoint:
 * - POST /api/v1/bootstrap - Authenticated user startup context
 *
 * This endpoint is the MANDATORY first call after login.
 * It resolves identity, enforces status, and returns minimal user context.
 *
 * IMPORTANT:
 * - This endpoint is authenticated (requires valid JWT)
 * - It is a UX gate, not a security gate (guards still enforce access)
 * - It MUST NOT return app-level config (use public bootstrap for that)
 * - Uses @SkipIdentityStatusCheck() to allow blocked users to see their status
 *
 * @see docs/canonical/AUTH_CONTRACT.md
 */

import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { SkipIdentityStatusCheck } from '../../../common/decorators/skip-identity-status-check.decorator';
import { AuthenticatedUser } from '../../../common/auth/auth.types';
import { BootstrapService } from '../bootstrap.service';
import { AuthenticatedBootstrapDto, AuthenticatedBootstrapResponseDto } from './dto';

@Controller('v1/bootstrap')
export class BootstrapController {
  constructor(private readonly bootstrapService: BootstrapService) {}

  /**
   * Get authenticated user bootstrap context.
   *
   * This is the MANDATORY first call after successful authentication.
   * Returns identity status and minimal profile context.
   *
   * Response variants:
   *
   * 1. ACTIVE user (HTTP 200):
   *    {
   *      "identity": { "status": "ACTIVE", "roles": ["USER"] },
   *      "profile": { "id": "uuid", "locale": "en", "timezone": "UTC" }
   *    }
   *
   * 2. SUSPENDED user with recovery (HTTP 200):
   *    {
   *      "identity": { "status": "SUSPENDED", "recoveryAvailable": true }
   *    }
   *
   * 3. DELETED user (HTTP 200):
   *    {
   *      "identity": { "status": "DELETED" }
   *    }
   *
   * NOTE: All statuses return 200 OK. The client MUST check identity.status
   * to determine app access. This allows suspended/deleted users to see
   * recovery options or account status messages.
   *
   * @example POST /api/v1/bootstrap
   *
   * @returns Bootstrap context appropriate to user's identity status
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @SkipIdentityStatusCheck()
  async bootstrap(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuthenticatedBootstrapResponseDto> {
    const response = await this.bootstrapService.getBootstrapContext(user.id, user.roles);
    return AuthenticatedBootstrapDto.fromServiceResponse(response);
  }
}
