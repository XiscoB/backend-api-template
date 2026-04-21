import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.types';
import { AppRole } from '../constants/roles';

/**
 * Extracts the current authenticated user from the request.
 *
 * The user object is populated by the JWT strategy after successful authentication.
 *
 * @example
 * ```typescript
 * @Get('me')
 * getMe(@CurrentUser() user: AuthenticatedUser) {
 *   return { id: user.id, email: user.email };
 * }
 *
 * // Extract specific property
 * @Get('my-id')
 * getMyId(@CurrentUser('id') userId: string) {
 *   return { userId };
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof AuthenticatedUser | undefined,
    ctx: ExecutionContext,
  ): AuthenticatedUser | string | AppRole[] | boolean | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new Error('CurrentUser decorator used on unauthenticated route');
    }

    // If a specific property is requested, return just that
    if (data) {
      return user[data];
    }

    return user;
  },
);
