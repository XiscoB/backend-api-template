import { SetMetadata } from '@nestjs/common';
import { SKIP_RESPONSE_WRAP_KEY } from '../interceptors/response-transform.interceptor';

/**
 * Skips the standard response wrapping for this endpoint.
 *
 * By default, all responses are wrapped in:
 * { data: T, meta: { requestId?, timestamp } }
 *
 * Use this decorator to return raw responses (e.g., health checks).
 *
 * @example
 * ```typescript
 * @SkipResponseWrap()
 * @Get('health')
 * health() {
 *   return { status: 'ok' };
 * }
 * ```
 */
export const SkipResponseWrap = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(SKIP_RESPONSE_WRAP_KEY, true);
