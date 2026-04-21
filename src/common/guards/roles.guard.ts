import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { AppRole } from '../constants/roles';

const ELEVATED_ROLES: readonly AppRole[] = [AppRole.ENTITY, AppRole.ADMIN, AppRole.SYSTEM];

/**
 * Roles Guard.
 *
 * Checks if the authenticated user has the required roles.
 * Use with @RequireRole() or @RequireAnyRole() decorators.
 *
 * This guard:
 * - Runs AFTER JwtAuthGuard (JWT must be valid first)
 * - Uses OR logic (user needs at least ONE of the required roles)
 * - Returns AUTH_FORBIDDEN on failure (handled by exception filter)
 *
 * Note: This guard is registered globally via APP_GUARD.
 * Routes without role decorators allow any authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    // No role metadata - allow any authenticated user
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (requiredRoles.includes(AppRole.USER)) {
      if (!user) {
        throw new ForbiddenException('Access denied');
      }
      return true;
    }

    // Enforce only elevated roles from metadata.
    // Baseline authenticated access remains unaffected.
    const requiredElevatedRoles = requiredRoles.filter((role) => ELEVATED_ROLES.includes(role));

    // No elevated roles required - allow any authenticated user
    if (requiredElevatedRoles.length === 0) {
      return true;
    }

    // JwtAuthGuard should run first, but fail safely if request.user is missing
    if (!user) {
      throw new ForbiddenException('Access denied');
    }

    // OR logic for elevated role requirements
    const hasRequiredRole = requiredElevatedRoles.some((role) => user.roles.includes(role));

    if (!hasRequiredRole) {
      // Do not expose which roles are required (security best practice)
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
