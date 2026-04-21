import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../../../src/common/decorators/current-user.decorator';
import { RequireAnyRole } from '../../../../src/common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../../../src/common/auth/auth.types';
import { AppRole } from '../../../../src/common/constants/roles';

/**
 * Whoami Controller - Minimal Example
 *
 * Demonstrates:
 * - JWT authentication at the boundary
 * - Guard enforcement with canonical roles
 * - Identity context extraction via @CurrentUser()
 *
 * This controller contains no business logic.
 * It exists solely to validate wiring and contract compliance.
 */
@Controller('whoami')
@RequireAnyRole(AppRole.USER)
export class WhoamiController {
  /**
   * Returns the authenticated identity context.
   *
   * Response shape:
   * - identityId: Internal UUID, resolved by auth pipeline from JWT sub
   * - roles: Canonical AppRole values extracted from JWT claims
   *
   * What this endpoint demonstrates:
   * - JWT signature validated by JwtAuthGuard (global)
   * - Identity resolved at pipeline level before controller executes
   * - Role enforcement via @RequireAnyRole decorator
   * - Controller receives normalized context, not raw JWT claims
   *
   * What this endpoint does NOT do:
   * - Access database directly
   * - Perform business logic
   * - Transform or enrich data
   * - Expose raw JWT sub claim
   */
  @Get()
  whoami(@CurrentUser() user: AuthenticatedUser): WhoamiResponse {
    // user.id: Internal identityId (UUID), resolved by auth pipeline.
    //          This is NOT the raw JWT sub claim.
    //          The mapping sub → identityId happens at pipeline level.
    //
    // user.roles: Canonical AppRole[] values.
    //             Extracted from provider-specific JWT claims.
    //             Unknown roles are filtered out.

    return {
      identityId: user.id,
      roles: user.roles,
    };
  }
}

/**
 * Response shape for GET /whoami
 *
 * Minimal contract: identity context only.
 * No business data. No profile information.
 */
interface WhoamiResponse {
  /** Internal identity UUID (not JWT sub) */
  identityId: string;

  /** Canonical roles assigned to this identity */
  roles: AppRole[];
}
