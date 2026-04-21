import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminUser } from './admin.types';

/**
 * Extract the authenticated admin user from the request.
 *
 * Only use within admin console routes protected by AdminPrivilegeGuard.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * @AdminReadOnly()
 * getProfile(@CurrentAdminUser() user: AdminUser) {
 *   return { sub: user.sub, privilege: user.adminPrivilege };
 * }
 * ```
 */
export const CurrentAdminUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AdminUser }>();
    return request.user;
  },
);
