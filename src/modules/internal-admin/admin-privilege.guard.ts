import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ADMIN_PRIVILEGE_KEY } from './admin.decorators';
import { AdminPrivilege, isAdminPrivilege, INTERNAL_ADMIN_CONFIG } from './internal-admin.config';
import { AdminUser } from './admin.types';

/**
 * Admin Privilege Guard.
 *
 * Enforces admin privilege requirements for internal admin console routes.
 *
 * This guard:
 * - Runs AFTER JWT authentication (requires valid JWT first)
 * - Extracts admin privileges from JWT claims
 * - Is separate from the public RolesGuard
 * - Has NO fallback access (explicit deny by default, per INTERNAL_ADMIN_CONFIG.safety.denyByDefault)
 *
 * Privilege hierarchy:
 * - ADMIN_WRITE implies ADMIN_READ
 * - ADMIN_READ does NOT imply ADMIN_WRITE
 */
@Injectable()
export class AdminPrivilegeGuard implements CanActivate {
  private readonly logger = new Logger(AdminPrivilegeGuard.name);
  private readonly config = INTERNAL_ADMIN_CONFIG;
  private readonly adminUserIds: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    // Load admin user allowlist at startup
    const raw = this.configService.get<string>('ADMIN_USER_IDS', '');
    this.adminUserIds = new Set(
      raw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    );

    if (this.adminUserIds.size > 0) {
      this.logger.warn(
        `Admin user allowlist loaded: ${this.adminUserIds.size} user(s) have ADMIN_WRITE access`,
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    this.logger.debug('AdminPrivilegeGuard.canActivate called');

    const requiredPrivilege = this.reflector.getAllAndOverride<AdminPrivilege>(
      ADMIN_PRIVILEGE_KEY,
      [context.getHandler(), context.getClass()],
    );

    this.logger.debug(`Required privilege: ${requiredPrivilege}`);

    // If no privilege is required, deny by default (fail-safe per config)
    if (!requiredPrivilege && this.config.safety.denyByDefault) {
      this.logger.warn('Admin route without privilege requirement - denying access');
      throw new ForbiddenException('Access denied');
    }

    const request = context.switchToHttp().getRequest<{ user?: AdminUser }>();
    const jwtUser = request.user as
      | { id?: string; sub?: string; email?: string; roles?: string[] }
      | undefined;

    this.logger.debug(`JWT user: ${JSON.stringify(jwtUser)}`);

    // Check both `sub` (OIDC standard) and `id` (internal field name)
    const userSub = jwtUser?.sub ?? jwtUser?.id;

    if (!userSub) {
      this.logger.warn('No JWT user sub/id found in request');
      throw new UnauthorizedException('Authentication required');
    }

    // Extract admin privilege from JWT claims (pass userSub)
    const adminPrivilege = this.extractAdminPrivilege({ ...jwtUser, sub: userSub });

    if (!adminPrivilege) {
      this.logger.warn(`User ${userSub} attempted admin access without privilege`);
      throw new ForbiddenException('Access denied');
    }

    // Check privilege hierarchy
    const hasAccess = this.checkPrivilegeAccess(adminPrivilege, requiredPrivilege);

    if (!hasAccess) {
      this.logger.warn(
        `User ${userSub} with ${adminPrivilege} attempted access requiring ${requiredPrivilege}`,
      );
      throw new ForbiddenException('Access denied');
    }

    // Attach admin user to request for downstream use
    request.user = {
      sub: userSub,
      email: jwtUser?.email,
      adminPrivilege,
    };

    return true;
  }

  /**
   * Extract admin privilege from JWT claims.
   *
   * Priority order:
   * 1. Supabase app_metadata (internal_admin + internal_admin_level) [PRIMARY METHOD]
   * 2. Check for ADMIN_WRITE or ADMIN_READ in roles claim [LEGACY]
   * 3. ENV allowlist can DENY access (optional deny-list)
   *
   * CRITICAL: ENV allowlist (ADMIN_USER_IDS) can only DENY, never GRANT.
   * If set, users NOT in the list are denied even if JWT grants privilege.
   * If empty, no deny-list is applied.
   *
   * Returns the highest privilege found (ADMIN_WRITE > ADMIN_READ).
   */
  private extractAdminPrivilege(
    user: {
      sub?: string;
      roles?: string[];
      internal_admin?: boolean;
      internal_admin_level?: 'read' | 'write';
    } & Record<string, unknown>,
  ): AdminPrivilege | null {
    const userSub = user.sub;
    if (!userSub) return null;

    // Priority 1: Supabase app_metadata (PRIMARY - recommended method)
    if (user.internal_admin === true) {
      const level = user.internal_admin_level ?? 'read';
      const privilege = level === 'write' ? AdminPrivilege.ADMIN_WRITE : AdminPrivilege.ADMIN_READ;

      // Check ENV deny-list (if configured)
      if (this.adminUserIds.size > 0 && !this.adminUserIds.has(userSub)) {
        this.logger.warn(
          `User ${userSub} has internal_admin=true in JWT but is NOT in ADMIN_USER_IDS allowlist - ACCESS DENIED`,
        );
        return null;
      }

      this.logger.log(
        `User ${userSub} granted ${privilege} via Supabase app_metadata (internal_admin_level=${level})`,
      );
      return privilege;
    }

    // Priority 2: Check roles in JWT claims (LEGACY - backwards compatibility)
    const roles: string[] = this.extractRoles(user);

    // Check for ADMIN_WRITE first (higher privilege)
    if (roles.some((role) => role === (AdminPrivilege.ADMIN_WRITE as string))) {
      // Check ENV deny-list (if configured)
      if (this.adminUserIds.size > 0 && !this.adminUserIds.has(userSub)) {
        this.logger.warn(
          `User ${userSub} has ADMIN_WRITE role but is NOT in ADMIN_USER_IDS allowlist - ACCESS DENIED`,
        );
        return null;
      }
      this.logger.log(`User ${userSub} granted ADMIN_WRITE via JWT roles (legacy)`);
      return AdminPrivilege.ADMIN_WRITE;
    }

    // Check for ADMIN_READ
    if (roles.some((role) => role === (AdminPrivilege.ADMIN_READ as string))) {
      // Check ENV deny-list (if configured)
      if (this.adminUserIds.size > 0 && !this.adminUserIds.has(userSub)) {
        this.logger.warn(
          `User ${userSub} has ADMIN_READ role but is NOT in ADMIN_USER_IDS allowlist - ACCESS DENIED`,
        );
        return null;
      }
      this.logger.log(`User ${userSub} granted ADMIN_READ via JWT roles (legacy)`);
      return AdminPrivilege.ADMIN_READ;
    }

    return null;
  }

  /**
   * Extract roles from JWT claims (supports multiple providers).
   */
  private extractRoles(user: Record<string, unknown>): string[] {
    // Try different claim locations (same as jwt.strategy.ts)
    const locations = [
      (user.app_metadata as { roles?: string[] })?.roles,
      (user.user_metadata as { roles?: string[] })?.roles,
      (user.realm_access as { roles?: string[] })?.roles,
      user.roles as string[] | undefined,
    ];

    for (const roles of locations) {
      if (Array.isArray(roles) && roles.length > 0) {
        return roles.filter((r): r is string => typeof r === 'string' && isAdminPrivilege(r));
      }
    }

    return [];
  }

  /**
   * Check if the user's privilege grants access to the required privilege.
   *
   * Privilege hierarchy:
   * - ADMIN_WRITE can access ADMIN_READ routes
   * - ADMIN_READ cannot access ADMIN_WRITE routes
   */
  private checkPrivilegeAccess(
    userPrivilege: AdminPrivilege,
    requiredPrivilege: AdminPrivilege,
  ): boolean {
    if (userPrivilege === AdminPrivilege.ADMIN_WRITE) {
      // ADMIN_WRITE can access everything
      return true;
    }

    if (userPrivilege === AdminPrivilege.ADMIN_READ) {
      // ADMIN_READ can only access ADMIN_READ routes
      return requiredPrivilege === AdminPrivilege.ADMIN_READ;
    }

    return false;
  }
}
