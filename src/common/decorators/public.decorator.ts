import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public (no authentication required).
 *
 * By default, all routes require a valid JWT.
 * Use this decorator to make specific routes accessible without authentication.
 *
 * @example
 * ```typescript
 * @Public()
 * @Get('health')
 * health() {
 *   return { status: 'ok' };
 * }
 * ```
 */
export const Public = (): ReturnType<typeof SetMetadata> => SetMetadata(IS_PUBLIC_KEY, true);
